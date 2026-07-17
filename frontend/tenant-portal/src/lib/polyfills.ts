// Targeted runtime polyfills for browsers that still run on Windows 7 — the
// newest Chrome there is 109 and Firefox ~115. Build-time transpilation (see
// vite.config.ts `build.target`) down-levels newer *syntax*, but these are
// *methods* added to built-ins after Chrome 109, so no target flag installs
// them — they must be shimmed at runtime. Each shim is guarded, so this file is
// a no-op on modern browsers. Import it first, before any app or vendor code.
//
// Newspaper offices are a known Windows-7 user base for this portal, so keep
// this list current: when a dependency (pdfjs, react-router, recharts…) starts
// calling a built-in newer than Chrome 109, add its guarded shim here.

type Resolvers<T> = { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (r?: unknown) => void };

// Promise.withResolvers — ES2024, Chrome 119. Used internally by pdfjs-dist v6.
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>(): Resolvers<T> {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// Change-array-by-copy methods — ES2023, Chrome 110 (just past the Win7 ceiling).
// Commonly emitted by libraries doing immutable updates.
const arr = Array.prototype as any;
if (typeof arr.toSorted !== 'function') {
  arr.toSorted = function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
    return [...this].sort(compareFn);
  };
}
if (typeof arr.toReversed !== 'function') {
  arr.toReversed = function <T>(this: T[]): T[] {
    return [...this].reverse();
  };
}
if (typeof arr.with !== 'function') {
  arr.with = function <T>(this: T[], index: number, value: T): T[] {
    const len = this.length;
    // Match native semantics: truncate toward zero, resolve negatives from the
    // end, and reject out-of-range indices with RangeError (never extend).
    const i = Math.trunc(index) || 0;
    const actual = i < 0 ? len + i : i;
    if (actual < 0 || actual >= len) throw new RangeError('Invalid index');
    const copy = [...this];
    copy[actual] = value;
    return copy;
  };
}
if (typeof arr.toSpliced !== 'function') {
  arr.toSpliced = function <T>(this: T[], start: number, deleteCount?: number, ...items: T[]): T[] {
    const copy = [...this];
    if (arguments.length <= 1) copy.splice(start);
    else copy.splice(start, deleteCount as number, ...items);
    return copy;
  };
}
