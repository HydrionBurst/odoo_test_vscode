import logging
import re
import sys
import threading
import time

from odoo import tools
from odoo.modules.registry import Registry

from ..bus import Bus

_logger = logging.getLogger(__name__)


if tools.config['workers'] > 1:
    _logger.error("Hot test is not supported in multi-worker mode")
    exit(1)


class OdooApiAdapter:
    def get_db_name(self):
        db_name = tools.config['db_name']
        if isinstance(db_name, list):
            db_name = db_name[0]
        return db_name

    def registry_new(self, db_name, install_modules=None):
        if not install_modules:
            return Registry.new(db_name)
        try:
            return Registry.new(db_name, install_modules=install_modules)
        except TypeError:
            # no param install_modules
            tools.config['init'] = {module: True for module in install_modules}
            return Registry.new(db_name, update_module=True)

odoo_api_adapter = OdooApiAdapter()


class HotTest(threading.Thread):
    """
    Dedicated thread for handling test execution
    """
    stop_event = Bus.stop_event

    def __init__(self, *args, **kwargs):
        super().__init__(daemon=True, name=f'{__name__}.HotTest')
        self.test_event = threading.Event()
        self.current_module = None
        self.current_test_tags = None

    def run_test(self, module, test_tags):
        """Request test execution (non-blocking)."""
        _logger.info("Received run_test request: test_tags=%s, module=%s", test_tags, module)

        if self.test_event.is_set():
            _logger.warning("Test already running, ignoring test request for module=%s, test_tags=%s",
                              module, test_tags)
            return
        self.current_module = module
        self.current_test_tags = test_tags
        self.test_event.set()

    def run(self):
        db_name = odoo_api_adapter.get_db_name()
        threading.current_thread().dbname = db_name
        while not self.stop_event.is_set():
            try:
                # Wait for test requests
                if self.test_event.wait(timeout=60):
                    if self.current_module and self.current_test_tags:
                        self._run_test(self.current_module, self.current_test_tags)
                        self.current_module = None
                        self.current_test_tags = None

                    self.test_event.clear()

            except Exception as e:
                _logger.error("Hot test thread error: %s", e, exc_info=True)
                time.sleep(5)

    def _run_test(self, module, test_tags):
        """Execute test for the given module and test tags."""

        _logger.info("Starting test execution for module=%s, test_tags=%s", module, test_tags)

        db_name = odoo_api_adapter.get_db_name()
        registry = Registry(db_name)

        if module not in registry._init_modules:
            _logger.info("Module %s not loaded, install it", module)
            odoo_api_adapter.registry_new(db_name, install_modules=[module])

            # reload the registry again to promise module loading order
            registry = odoo_api_adapter.registry_new(db_name)
            if module not in registry._init_modules:
                _logger.error("Module %s cannot be installed, skip tests", module)
                return

        registry.check_signaling()

        tools.config['test_tags'] = test_tags
        tools.config['test_enable'] = True
        self._reload_and_run_tests(module)
        tools.config['test_enable'] = None
        tools.config['test_tags'] = None

        _logger.info("Completed test execution for module=%s, test_tags=%s", module, test_tags)


    def _reload_and_run_tests(self, module):
        """Reload test modules and run tests."""
        try:
            # Force reload of test modules
            self._force_reload_test_modules()

            # Import test loader
            from odoo.tests import loader

            # Run at_install tests
            _logger.info("Running at_install tests for module: %s", module)
            with Registry._lock:
                db_name = odoo_api_adapter.get_db_name()
                registry = Registry(db_name)
                try:
                    # best effort to restore the test environment
                    registry.loaded = False
                    registry.ready = False
                    at_install_suite = loader.make_suite([module], 'at_install')
                    if at_install_suite.countTestCases():
                        at_install_results = loader.run_suite(at_install_suite)
                        _logger.info("at_install tests completed: %d tests, %d failures, %d errors",
                                    at_install_results.testsRun,
                                    at_install_results.failures_count,
                                    at_install_results.errors_count)
                finally:
                    registry.loaded = True
                    registry.ready = True

            # Run post_install tests
            _logger.info("Running post_install tests for module: %s", module)
            post_install_suite = loader.make_suite([module], 'post_install')
            if post_install_suite.countTestCases():
                post_install_results = loader.run_suite(post_install_suite)
                _logger.info("post_install tests completed: %d tests, %d failures, %d errors",
                            post_install_results.testsRun,
                            post_install_results.failures_count,
                            post_install_results.errors_count)

            if not at_install_suite.countTestCases() and not post_install_suite.countTestCases():
                _logger.warning("No tests to run for module: %s with test_tags: %s", module, tools.config['test_tags'])

        except Exception as e:
            _logger.error("Error reloading and running tests for module %s: %s", module, e, exc_info=True)

    def _force_reload_test_modules(self):
        """Force reload of test modules that may have been modified."""
        test_module_name_pattern = r'^odoo\.addons\.\w+\.tests'

        # Find all test modules that are currently loaded
        modules_to_reload = []
        for module_key in sys.modules:
            if re.match(test_module_name_pattern, module_key):
                modules_to_reload.append(module_key)

        # Remove from sys.modules to force reload
        for module_key in modules_to_reload:
            _logger.debug("Removing module from sys.modules for reload: %s", module_key)
            del sys.modules[module_key]


hot_test = HotTest()
hot_test.start()

Bus.methods['run_test'] = hot_test.run_test
