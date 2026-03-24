# -*- coding: utf-8 -*-
"""统一日志配置模块

提供统一的日志初始化函数，适用于所有运行模式（API Server / CLI / Worker 等）。
  - setup_logging():          配置控制台输出（stderr WARNING+）
  - enable_file_logging():    添加文件日志（追加写入）
  - enable_session_logging(): 为指定 session 创建独立日志文件
  - 通过 contextvars 自动注入 session_id，方便按会话筛查
"""

import contextvars
import logging
import sys
from pathlib import Path
from typing import Optional


# ============================================================
# session_id 上下文管理
# ============================================================

_session_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "session_id", default="-"
)


def set_session_id(session_id: str) -> None:
    """设置当前协程/线程的 session_id（会自动出现在后续所有日志中）"""
    _session_id_var.set(session_id or "-")


def get_session_id() -> str:
    """获取当前 session_id"""
    return _session_id_var.get()


class _SessionFilter(logging.Filter):
    """将 session_id 注入每条日志记录"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.session_id = _session_id_var.get()  # type: ignore[attr-defined]
        return True


# ============================================================
# 默认配置
# ============================================================

# 日志格式：时间 [模块名] 级别 [sess:会话ID] 消息
_DEFAULT_FMT = "%(asctime)s [%(name)s] %(levelname)s [sess:%(session_id)s] %(message)s"
_DEFAULT_DATEFMT = "%Y-%m-%d %H:%M:%S"
# 默认日志文件名，使用时应替换为项目实际名称
_LOG_FILENAME = "agent.log"

_file_handler: Optional[logging.FileHandler] = None


def setup_logging(
    level: str = "info",
    project_name: str = "",
    noisy_loggers: Optional[list[str]] = None,
) -> logging.Logger:
    """初始化日志系统：只配置控制台（stderr WARNING+）输出。
    文件日志由 enable_file_logging() 单独添加。

    Args:
        level: root logger 级别，可选 debug/info/warning/error
        project_name: 项目包名，该包下所有 logger 强制 DEBUG 级别
        noisy_loggers: 需要抑制到 WARNING 的第三方库列表
    """
    global _LOG_FILENAME

    levels = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
    }
    log_level = levels.get(level.lower(), logging.INFO)

    if project_name:
        _LOG_FILENAME = f"{project_name}.log"

    formatter = logging.Formatter(fmt=_DEFAULT_FMT, datefmt=_DEFAULT_DATEFMT)
    session_filter = _SessionFilter()

    root = logging.getLogger()
    root.setLevel(log_level)
    root.handlers.clear()

    # 控制台只输出 WARNING 及以上，避免刷屏
    ch = logging.StreamHandler(sys.stderr)
    ch.setLevel(logging.WARNING)
    ch.setFormatter(formatter)
    ch.addFilter(session_filter)
    root.addHandler(ch)

    # 项目自身的 logger 强制 DEBUG，确保文件日志能捕获所有细节
    if project_name:
        logging.getLogger(project_name).setLevel(logging.DEBUG)

    # 抑制第三方库的 DEBUG 噪声
    default_noisy = [
        "asyncio", "httpcore", "httpx", "urllib3",
        "PIL", "openai._base_client", "LiteLLM", "litellm",
    ]
    for name in (noisy_loggers or default_noisy):
        logging.getLogger(name).setLevel(logging.WARNING)

    return root


def enable_file_logging(workspace_dir: str, level: str = "debug") -> None:
    """添加或切换文件日志 handler，日志写入 workspace_dir/{project}.log。
    可多次调用：新目录会替换旧 handler，保证日志跟随当前工作目录。

    Args:
        workspace_dir: 日志文件所在目录
        level: 文件日志级别，默认 debug（记录所有细节）
    """
    global _file_handler

    levels = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
    }
    log_level = levels.get(level.lower(), logging.DEBUG)

    ws_path = Path(workspace_dir)
    ws_path.mkdir(parents=True, exist_ok=True)
    log_file = ws_path / _LOG_FILENAME

    # 如果已有 handler 且路径相同，跳过
    if _file_handler is not None:
        old_path = _file_handler.baseFilename
        if str(log_file.resolve()) == old_path:
            return
        logging.getLogger().removeHandler(_file_handler)
        _file_handler.close()

    formatter = logging.Formatter(fmt=_DEFAULT_FMT, datefmt=_DEFAULT_DATEFMT)
    session_filter = _SessionFilter()

    fh = logging.FileHandler(str(log_file), encoding="utf-8")
    fh.setLevel(log_level)
    fh.setFormatter(formatter)
    fh.addFilter(session_filter)

    logging.getLogger().addHandler(fh)
    _file_handler = fh

    logging.info(f"文件日志已启用: {log_file}")


_session_file_handlers: dict[str, logging.FileHandler] = {}


def enable_session_logging(workspace_dir: str, session_id: str) -> None:
    """为指定 session 创建独立的日志文件: {workspace}/logs/{project}_{session_id[:12]}.log

    Args:
        workspace_dir: 工作目录
        session_id: 会话 ID
    """
    if not session_id or session_id == "-":
        return

    if session_id in _session_file_handlers:
        return

    try:
        log_name = _LOG_FILENAME.replace(".log", "")
        logs_path = Path(workspace_dir).resolve() / "logs"
        logs_path.mkdir(parents=True, exist_ok=True)
        log_file = logs_path / f"{log_name}_{session_id[:12]}.log"

        formatter = logging.Formatter(fmt=_DEFAULT_FMT, datefmt=_DEFAULT_DATEFMT)
        session_filter = _SessionFilter()

        fh = logging.FileHandler(str(log_file), encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(formatter)
        fh.addFilter(session_filter)

        # 只记录本 session 的日志
        class _SessionOnlyFilter(logging.Filter):
            def filter(self, record: logging.LogRecord) -> bool:
                return getattr(record, "session_id", "-") == session_id

        fh.addFilter(_SessionOnlyFilter())

        logging.getLogger().addHandler(fh)
        _session_file_handlers[session_id] = fh
        logging.info(f"Session 日志文件: {log_file}")

    except Exception as exc:
        print(f"[agent] enable_session_logging failed: {exc}", file=sys.stderr)


def get_logger(name: str) -> logging.Logger:
    """获取命名 logger

    推荐用法:
        logger = get_logger(__name__)
        logger.info("[Agent] 开始执行任务")
    """
    return logging.getLogger(name)
