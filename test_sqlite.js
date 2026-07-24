const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');
db.serialize(() => {
  db.run("CREATE TABLE test (current_end TEXT)");
  db.run("INSERT INTO test VALUES ('2026-08-23T16:19:54.123Z')");
  
  db.get("SELECT current_end > CURRENT_TIMESTAMP AS res FROM test", (err, row) => {
    console.log("current_end > CURRENT_TIMESTAMP:", row.res);
  });
  db.get("SELECT current_end > datetime('now') AS res2 FROM test", (err, row) => {
    console.log("current_end > datetime('now'):", row.res2);
  });
});
db.close();
