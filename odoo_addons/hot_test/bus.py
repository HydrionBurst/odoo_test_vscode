import json
import logging
import socket
import threading
import time

from odoo.service.server import CommonServer

_logger = logging.getLogger(__name__)


class Bus(threading.Thread):
    """
    Dedicated thread for listening UDP notifications and handling simple commands
    """
    methods = {}
    stop_event = threading.Event()

    def __init__(self):
        super().__init__(daemon=True, name=f'{__name__}.Bus')
        self._sock = None
        self._host = '127.0.0.1'
        self._port = 9999

    def loop(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            self._sock = sock
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((self._host, self._port))
            sock.setblocking(False)
            _logger.info("Hot test UDP bus listening on %s:%s", self._host, self._port)

            while not self.stop_event.is_set():
                try:
                    sock.settimeout(1.0)  # 1 second timeout
                    data, addr = sock.recvfrom(65536)
                    payload = data.decode('utf-8', errors='ignore')
                    self._handle_notification(payload)
                except socket.timeout:
                    continue
                except Exception as e:
                    if not self.stop_event.is_set():
                        _logger.error("Error handling UDP payload: %s", e, exc_info=True)

    def _handle_notification(self, payload):
        """Handle a UDP message with JSON-RPC 2.0 format."""
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as e:
            _logger.error("Invalid JSON in UDP payload: %s", e)
            return

        if not isinstance(data, dict):
            _logger.error("Invalid payload in UDP message: %s", payload)
            return

        # Validate JSON-RPC 2.0 format
        if data.get('jsonrpc') != '2.0':
            _logger.error("Invalid JSON-RPC version in message: %s", data.get('jsonrpc'))
            return

        method = self.methods.get(data.get('method'))
        if not method:
            _logger.error("Missing method in JSON-RPC message: %s", data)
            return

        params = data.get('params')

        _logger.info("Received JSON-RPC message: method=%s", data.get('method'))

        if isinstance(params, dict):
            method(**params)
        elif isinstance(params, list):
            method(*params)
        elif params is None:
            method()
        else:
            _logger.error("Invalid params in JSON-RPC message: %s", params)
            return

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.loop()
            except Exception as exc:
                if self.stop_event.is_set():
                    continue
                _logger.error("Bus thread error, sleep and retry: %s", exc, exc_info=True)
                time.sleep(3)


CommonServer.on_stop(Bus.stop_event.set)
bus = Bus()
bus.start()
