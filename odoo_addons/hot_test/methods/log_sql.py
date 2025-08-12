import logging

from ..bus import Bus

_logger = logging.getLogger(__name__)


def log_sql(enabled):
    _logger.info("Received log_sql request: enabled=%s", enabled)
    from odoo.sql_db import _logger as sql_db_logger

    is_log_sql = sql_db_logger.isEnabledFor(logging.DEBUG)
    if enabled and not is_log_sql:
        sql_db_logger.setLevel(logging.DEBUG)
    elif not enabled and is_log_sql:
        sql_db_logger.setLevel(logging.INFO)

Bus.methods['log_sql'] = log_sql
