// Removes the eval sandbox app database so every eval run starts with no campaigns or memories.
// The brand index in the sandbox is kept (it is unpacked from the seed or reused).
import fs from "node:fs";
for (const f of ["app.db", "app.db-wal", "app.db-shm"]) fs.rmSync(`data/eval/${f}`, { force: true });
