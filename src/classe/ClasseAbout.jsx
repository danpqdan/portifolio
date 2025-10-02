// Simple class responsible for About page lifecycle
export default class ClasseAbout {
    constructor(root) {
        this.root = root;
        this.running = false;
        this._interval = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        console.info('[ClasseAbout] started');
        if (this.root) {
            this._interval = setInterval(() => {
                try {
                    this.root.dataset.classeAboutTs = Date.now();
                } catch (err) { console.debug('[ClasseAbout] write ts failed', err); }
            }, 1000);
        }
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        console.info('[ClasseAbout] stopped');
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }
}

