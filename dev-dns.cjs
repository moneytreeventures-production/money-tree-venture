"use strict";

const dns = require("node:dns");
const net = require("node:net");

// Defaults to Google DNS because Node's resolver reports 127.0.0.1 on this PC.
// Set MTV_DEV_DNS_SERVER to use a different server.
const server = (process.env.MTV_DEV_DNS_SERVER || "8.8.8.8").trim();

if (!net.isIP(server)) {
  throw new Error("MTV_DEV_DNS_SERVER must be a valid IP address.");
}

dns.setServers([server]);