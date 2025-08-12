{
    'name': 'Hot Test',
    'version': '1.0',
    'category': 'Testing',
    'summary': 'Hot reload and run tests via PostgreSQL notifications',
    'description': """
        Hot Test Module
        ===============

        This module provides hot test functionality for Odoo development:

        * Listens to PostgreSQL channel 'hot_test'
        * Automatically re-runs tests when notifications are received
        * Supports test filtering via test tags
        * Handles module installation and reloading

        Notification Format:
        * test_tags: Test tags to filter tests (string)
        * module_name: Module name to test (string)
        * command: Optional command to execute (string)
        * arg: Optional command argument (any)

        Requirements:
        * Single-worker mode only (workers = 1)
        * PostgreSQL database
    """,
    'author': 'HydrionBurst',
    'depends': ['base'],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}

