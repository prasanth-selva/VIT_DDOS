class RollingWindow {
  constructor(windowSeconds) {
    this.windowSeconds = windowSeconds;
    this.buckets = new Map();
  }

  add(value, timestamp = Date.now()) {
    const second = Math.floor(timestamp / 1000);
    const current = this.buckets.get(second) || 0;
    this.buckets.set(second, current + value);
    this.prune(second);
  }

  prune(currentSecond = Math.floor(Date.now() / 1000)) {
    const cutoff = currentSecond - this.windowSeconds;
    for (const key of this.buckets.keys()) {
      if (key < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  sum() {
    let total = 0;
    for (const value of this.buckets.values()) {
      total += value;
    }
    return total;
  }

  series() {
    const current = Math.floor(Date.now() / 1000);
    const points = [];
    for (let i = this.windowSeconds - 1; i >= 0; i -= 1) {
      const second = current - i;
      points.push(this.buckets.get(second) || 0);
    }
    return points;
  }
}

module.exports = RollingWindow;
