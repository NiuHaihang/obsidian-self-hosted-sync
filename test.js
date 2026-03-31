function makeConflictPath(path, clientId, timestamp) {
  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  const stamp = timestamp.toISOString().replace(/[-:]/g, "").replace(".", "").slice(0, 15);
  return `${stem}.conflict.${stamp}.${clientId.slice(0, 8)}${ext}`;
}
console.log(makeConflictPath("folder.dir/file", "client123", new Date()));
