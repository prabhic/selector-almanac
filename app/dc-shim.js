/** Minimal state container for AtlasApp (replaces mock DCLogic). */
export class DCLogic {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this._subs = [];
  }

  setState(patch) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    Object.assign(this.state, next);
    for (const fn of this._subs) fn();
    this.componentDidUpdate?.();
  }

  subscribe(fn) {
    this._subs.push(fn);
    return () => {
      this._subs = this._subs.filter((f) => f !== fn);
    };
  }
}
