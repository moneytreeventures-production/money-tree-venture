
"use strict";

const dns = require("node:dns");
const net = require("node:net");

const server = process.env.MTV_DEV_DNS_SERVER?.trim();

if (server) {
  if (!net.isIP(server)) {
    throw new Error("MTV_DEV_DNS_SERVER must be a valid IP address.");
  }

  dns.setServers([server]);
}
