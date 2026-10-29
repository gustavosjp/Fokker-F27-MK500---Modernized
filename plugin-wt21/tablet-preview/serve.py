"""Local server for the tablet's browser preview (not shipped). Maps:
  /             -> tablet-preview/index.html
  /preview/...  -> tablet-preview/...       (fake sim globals)
  /dist/...     -> dist/...                 (F27TabletPreview.js)
  /tablet/...   -> tablet/...               (F27Tablet.css)
  /Pages/VCockpit/Instruments/F27WT21/Tablet/... -> tablet/... (the font, as the css asks for it in the sim)
  /Pages/...    -> the package's html_ui/Pages/... (msfssdk.js, exactly as the sim serves it)
Usage: python serve.py [port]
"""
import http.server
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
HTML_UI = os.path.join(os.path.dirname(PLUGIN), 'PackageSources', 'bgt-f27500-modernized', 'html_ui')
ROUTES = [('/preview/', HERE), ('/dist/', os.path.join(PLUGIN, 'dist')), ('/tablet/', os.path.join(PLUGIN, 'tablet')),
          ('/Pages/VCockpit/Instruments/F27WT21/Tablet/', os.path.join(PLUGIN, 'tablet')),   # the tablet's own files from source
          ('/Pages/', os.path.join(HTML_UI, 'Pages'))]


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?', 1)[0].split('#', 1)[0]
        if path in ('/', '/index.html'):
            return os.path.join(HERE, 'index.html')
        for prefix, root in ROUTES:
            if path.startswith(prefix):
                rel = os.path.normpath(path[len(prefix):]).lstrip('\\/')
                full = os.path.join(root, rel)
                return full if os.path.commonpath([root, full]) == root else root
        return os.path.join(HERE, '__missing__')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8127
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
