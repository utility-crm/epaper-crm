// Polyfill for Promise.withResolvers (ES2024). pdfjs-dist v6 calls it internally,
// but it's unavailable on older browsers — notably the newest Chrome (109) and
// Firefox that still run on Windows 7, where PDF conversion otherwise throws
// "Promise.withResolvers is not a function". Import this module for its side
// effect before importing pdfjs.
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
