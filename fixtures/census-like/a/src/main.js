// CommonJS, subpath import, scoped package. minimist and debug are declared but never imported here.
const fp = require("lodash/fp");
const util = require("@scope/util/lib/strings");
const local = require("./local");
const fs = require("node:fs");

module.exports = { fp, util, local, fs };
