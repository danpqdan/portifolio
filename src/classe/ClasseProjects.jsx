export default class ClasseProjects {
  constructor(root) {
    this.root = root;
    this.running = false;
    this._interval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.info('[ClasseProjects] started');
    if (this.root) {
      this._interval = setInterval(() => {
        try {
          this.root.dataset.classeProjectsTs = Date.now();
        } catch (err) { console.debug('[ClasseProjects] write ts failed', err); }
      }, 1000);
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    console.info('[ClasseProjects] stopped');
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }
}
