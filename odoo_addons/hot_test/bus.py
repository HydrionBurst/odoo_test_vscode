import json
import logging
import selectors
import threading
import time

from psycopg2 import InterfaceError

import odoo
from odoo.service.server import CommonServer

_logger = logging.getLogger(__name__)


class Bus(threading.Thread):
    """
    Dedicated thread for listening to PostgreSQL notifications and handling simple commands
    """
    methods = {}
    stop_event = threading.Event()

    def __init__(self):
        super().__init__(daemon=True, name=f'{__name__}.Bus')

    def loop(self):
        with odoo.sql_db.db_connect('postgres').cursor() as cr, \
                selectors.DefaultSelector() as sel:

            cr.execute("LISTEN hot_test")
            cr.commit()
            conn = cr._cnx
            sel.register(conn, selectors.EVENT_READ)
            while not self.stop_event.is_set():
                if sel.select(50):  # 50 second timeout
                    conn.poll()
                    while conn.notifies:
                        notification = conn.notifies.pop()
                        try:
                            self._handle_notification(notification.payload)
                            conn.poll()
                            conn.notifies.clear()  # ignore additional notifications
                        except Exception as e:
                            _logger.error("Error handling hot_test notification: %s", e, exc_info=True)

    def _handle_notification(self, payload):
        """Handle a hot_test notification with JSON-RPC 2.0 format."""
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as e:
            _logger.error("Invalid JSON in hot_test notification: %s", e)
            return

        if not isinstance(data, dict):
            _logger.error("Invalid payload in hot_test notification: %s", payload)
            return

        # Validate JSON-RPC 2.0 format
        if data.get('jsonrpc') != '2.0':
            _logger.error("Invalid JSON-RPC version in notification: %s", data.get('jsonrpc'))
            return

        method = self.methods.get(data.get('method'))
        if not method:
            _logger.error("Missing method in JSON-RPC notification: %s", data)
            return

        params = data.get('params')

        _logger.info("Received JSON-RPC notification: method=%s", method)

        if isinstance(params, dict):
            method(**params)
        elif isinstance(params, list):
            method(*params)
        elif params is None:
            method()
        else:
            _logger.error("Invalid params in JSON-RPC notification: %s", params)
            return

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.loop()
            except Exception as exc:
                if isinstance(exc, InterfaceError) and self.stop_event.is_set():
                    continue
                _logger.exception("Bus thread error, sleep and retry")
                time.sleep(3)

CommonServer.on_stop(Bus.stop_event.set)
bus = Bus()
bus.start()
