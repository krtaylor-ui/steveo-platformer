const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  // Remove query string
  let urlPath = req.url.split('?')[0];
  
  // Prevent directory traversal
  if (urlPath.includes('..')) {
    res.writeHead(403, {'Content-Type': 'text/plain'});
    res.end('Forbidden');
    return;
  }
  
  // Default to index.html for root
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  
  // Build file path
  let filePath = path.join(__dirname, urlPath);
  
  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`404: ${urlPath}`);
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('404 Not Found');
      return;
    }
    
    // Read file
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('500 Server Error');
        return;
      }
      
      // Get MIME type
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      // Send file
      res.writeHead(200, {'Content-Type': contentType});
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});