#!/usr/bin/env node
/**
 * 找出手機／平板真的連得到的區域網路 IP。
 *
 * 為什麼需要這支：Windows 上通常有一堆虛擬網卡（Hyper-V 的 vEthernet、
 * VMware 的 VMnet、WSL、Docker），它們也是「非 internal 的 IPv4」，
 * 但手機完全連不到。天真地挑第一個幾乎一定挑錯。
 */

import os from 'node:os';
import { pathToFileURL } from 'node:url';

/** 這些網卡手機連不到 */
const VIRTUAL =
  /vethernet|vmware|vmnet|virtualbox|vbox|hyper-?v|wsl|docker|loopback|tap-|tailscale|zerotier|bluetooth|npcap|default switch/i;

/** 這些網卡名稱通常就是實體網路（含繁中 Windows 的名稱） */
const PHYSICAL = /^(wi-?fi|wlan|無線|ethernet|乙太網路|區域連線|en\d|wlp|eth\d)/i;

function rank(name, address) {
  let score = 0;
  if (PHYSICAL.test(name)) score += 100;

  // 家用路由器最常見的網段，優先度最高
  if (address.startsWith('192.168.')) score += 50;
  else if (address.startsWith('10.')) score += 30;
  else {
    // 172.16–172.31 也是私有網段，但虛擬網卡很愛用，壓低
    const b = Number(address.split('.')[1]);
    if (b >= 16 && b <= 31) score += 5;
  }

  // 網段閘道位址（x.x.x.1）多半是虛擬網卡自己當閘道
  if (address.endsWith('.1')) score -= 20;

  return score;
}

/** @returns {{name:string,address:string,score:number}[]} 最可能正確的排最前面 */
export function lanIps() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ name, address: a.address, score: rank(name, a.address) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// 直接執行時當 CLI 用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const list = lanIps();
  if (process.argv.includes('--verbose')) {
    for (const c of list) console.log(`${String(c.score).padStart(4)}  ${c.address.padEnd(16)} ${c.name}`);
  } else {
    for (const c of list.slice(0, 3)) console.log(c.address);
  }
}
