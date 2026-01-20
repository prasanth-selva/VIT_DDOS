const os = require('os');

let lastCpu = process.cpuUsage();
let lastHrtime = process.hrtime.bigint();

function getCpuPercent() {
  const currentCpu = process.cpuUsage();
  const currentHr = process.hrtime.bigint();
  const elapsedMicros = Number(currentHr - lastHrtime) / 1000;

  const userDiff = currentCpu.user - lastCpu.user;
  const systemDiff = currentCpu.system - lastCpu.system;
  const totalCpuMicros = userDiff + systemDiff;

  lastCpu = currentCpu;
  lastHrtime = currentHr;

  if (elapsedMicros <= 0) return 0;
  const cores = os.cpus().length || 1;
  const percent = Math.min(100, (totalCpuMicros / (elapsedMicros * cores)) * 100);
  return Number.isFinite(percent) ? percent : 0;
}

function getSystemMetrics() {
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;
  const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

  return {
    uptimeSeconds: process.uptime(),
    cpuPercent: getCpuPercent(),
    memory: {
      rssMb: mem.rss / (1024 * 1024),
      heapUsedMb: mem.heapUsed / (1024 * 1024),
      heapTotalMb: mem.heapTotal / (1024 * 1024),
      heapUsedPercent,
      systemUsedPercent: usedMemPercent
    },
    loadAvg: os.loadavg(),
    nodeVersion: process.version
  };
}

module.exports = {
  getSystemMetrics
};
