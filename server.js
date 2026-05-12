const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
  // Default to index.html for root
  let filePath = req.url === '/' ? path.join(__dirname, 'index.html') : path.join(__dirname, req.url);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('404 Not Found');
      return;
    }
    
    // Set correct content type
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'application/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.json') contentType = 'application/json';
    if (ext === '.png' || ext === '.jpg' || ext === '.gif') contentType = 'image/' + ext.slice(1);
    
    res.writeHead(200, {'Content-Type': contentType});
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
