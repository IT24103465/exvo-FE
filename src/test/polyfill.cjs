const wt = require('node:worker_threads')
if (typeof wt.markAsUncloneable !== 'function') {
  wt.markAsUncloneable = (obj) => obj
}
