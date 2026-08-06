export class InMemoryJobQueue {
  constructor({ handler, onError = console.error } = {}) {
    if (typeof handler !== "function") {
      throw new Error("job queue handler is required");
    }
    this.handler = handler;
    this.onError = onError;
    this.jobs = new Set();
  }

  enqueue(event) {
    const job = Promise.resolve()
      .then(() => this.handler(event))
      .catch((error) => this.onError(error, event))
      .finally(() => this.jobs.delete(job));
    this.jobs.add(job);
    return job;
  }

  async waitForIdle() {
    await Promise.allSettled([...this.jobs]);
  }
}
