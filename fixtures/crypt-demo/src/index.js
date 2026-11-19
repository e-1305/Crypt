// Demo app: a few direct imports on purpose, so the "is it used?" signal has something to find.
const _ = require("lodash");
import $ from "jquery";
import fetch from "node-fetch";
import { helper } from "./helper.js";

export async function run(url) {
  const res = await fetch(url);
  $(document.body).text(_.capitalize(await res.text()));
  return helper();
}
