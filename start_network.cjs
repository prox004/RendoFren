const { spawn, execSync } = require('child_process');
const path = require('path');

// Colored console output prefix mappings
const log = (prefix, message, colorCode) => {
  const reset = '\x1b[0m';
  const lines = message.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log(`${colorCode}${prefix}${reset} ${line}`);
    }
  });
};

// Automated port freeing helper for Windows to guarantee startup reliability
const clearPort = (port) => {
  try {
    if (process.platform === 'win32') {
      const pid = execSync(`powershell -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess"`).toString().trim();
      if (pid && parseInt(pid) > 0) {
        console.log(`\x1b[33m[System] Port ${port} is currently occupied by PID ${pid}. Terminating blocker process...\x1b[0m`);
        execSync(`taskkill /F /PID ${pid}`);
        console.log(`\x1b[32m[System] Port ${port} is now free and ready!\x1b[0m`);
      }
    }
  } catch (e) {
    // Port is already free or access was denied, fail silently and proceed
  }
};

console.log('\x1b[1m\x1b[35m[RendoFren Launcher]\x1b[0m Spawning pipeline cluster components...\n');

// Guarantee that active server ports 5000 (backend) and 3000 (frontend default) are completely cleared
clearPort(5000);
clearPort(3000);

// 1. Spawning Backend Server
const backend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  shell: true
});

backend.stdout.on('data', data => log('[Backend]', data, '\x1b[35m')); // Magenta prefix
backend.stderr.on('data', data => log('[Backend-Err]', data, '\x1b[31m')); // Red error prefix

// 2. Spawning Frontend Client
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  shell: true
});

frontend.stdout.on('data', data => log('[Frontend]', data, '\x1b[36m')); // Cyan prefix
frontend.stderr.on('data', data => log('[Frontend-Err]', data, '\x1b[31m')); // Red error prefix

// Handle exit codes
backend.on('close', code => {
  console.log(`\x1b[31m[System] Backend exited with code ${code}\x1b[0m`);
});

frontend.on('close', code => {
  console.log(`\x1b[31m[System] Frontend exited with code ${code}\x1b[0m`);
});

// Handle Ctrl+C termination gracefully on Windows
process.on('SIGINT', () => {
  console.log('\n\x1b[1m\x1b[33m[RendoFren Launcher]\x1b[0m Intercepted SIGINT. Stopping child processes...');
  
  // On Windows, spawned processes in shell have their own task trees, killing them gracefully
  try {
    backend.kill('SIGINT');
  } catch (e) {}
  try {
    frontend.kill('SIGINT');
  } catch (e) {}
  
  setTimeout(() => {
    console.log('\x1b[1m\x1b[32m[RendoFren Launcher]\x1b[0m Shut down successfully.');
    process.exit(0);
  }, 1000);
});
