'use strict';
/**
 * HEAVY STORE TOP UP — product catalog
 * Denomination catalog for the 26 games. `cost` is the estimated supplier
 * cost (IDR). Selling price is computed dynamically by the server pricing
 * engine (cost + margin, never below the safety floor), so it is NOT stored
 * here. Items flagged `promo` get an explicit promo_price (5% margin) that
 * still stays above the safety floor.
 *
 * Admins can freely edit / add / remove products from the Admin Panel after
 * seeding — this file is only a sensible starting point.
 */

// margin (percent) applied to every seeded product by default
const DEFAULT_MARGIN = 8;
// promo margin (percent) — must stay >= min_margin_percent (3%)
const PROMO_MARGIN = 5;

const CATALOG = {
  'free-fire': [
    { name: '5 Diamond', cost: 600 },
    { name: '12 Diamond', cost: 1400 },
    { name: '50 Diamond', cost: 5500, promo: true },
    { name: '70 Diamond', cost: 7500 },
    { name: '140 Diamond', cost: 14500 },
    { name: '355 Diamond', cost: 36000 },
    { name: '720 Diamond', cost: 72000, promo: true },
    { name: '1450 Diamond', cost: 143000 },
    { name: '2180 Diamond', cost: 215000 },
    { name: 'Membership Mingguan', cost: 27000 },
    { name: 'Membership Bulanan', cost: 78000 },
  ],
  'free-fire-max': [
    { name: '100 Diamond', cost: 10500, promo: true },
    { name: '310 Diamond', cost: 31500 },
    { name: '520 Diamond', cost: 52000 },
    { name: '1060 Diamond', cost: 105000 },
    { name: '2180 Diamond', cost: 215000 },
  ],
  'mobile-legends': [
    { name: '5 Diamond', cost: 1500 },
    { name: '12 Diamond', cost: 3400 },
    { name: '19 Diamond', cost: 5200 },
    { name: '44 Diamond', cost: 12000, promo: true },
    { name: '86 Diamond', cost: 23000 },
    { name: '172 Diamond', cost: 45000 },
    { name: '257 Diamond', cost: 67000 },
    { name: '355 Diamond', cost: 92000, promo: true },
    { name: '706 Diamond', cost: 182000 },
    { name: '2195 Diamond', cost: 560000 },
    { name: 'Weekly Diamond Pass', cost: 27000 },
    { name: 'Twilight Pass', cost: 145000 },
  ],
  roblox: [
    { name: '80 Robux', cost: 15000 },
    { name: '400 Robux', cost: 68000, promo: true },
    { name: '800 Robux', cost: 135000 },
    { name: '1700 Robux', cost: 280000 },
    { name: '4500 Robux', cost: 720000 },
    { name: '10000 Robux', cost: 1550000 },
  ],
  'pubg-mobile': [
    { name: '60 UC', cost: 15000 },
    { name: '325 UC', cost: 75000, promo: true },
    { name: '660 UC', cost: 150000 },
    { name: '1800 UC', cost: 400000 },
    { name: '3850 UC', cost: 850000 },
    { name: '8100 UC', cost: 1750000 },
  ],
  'pubg-pc': [
    { name: '100 G-Coin', cost: 15000 },
    { name: '500 G-Coin', cost: 72000 },
    { name: '1000 G-Coin', cost: 140000, promo: true },
    { name: '2500 G-Coin', cost: 340000 },
    { name: '5000 G-Coin', cost: 670000 },
  ],
  valorant: [
    { name: '125 VP', cost: 15000 },
    { name: '420 VP', cost: 50000, promo: true },
    { name: '700 VP', cost: 82000 },
    { name: '1375 VP', cost: 160000 },
    { name: '2400 VP', cost: 280000 },
    { name: '4000 VP', cost: 460000 },
  ],
  'counter-strike-2': [
    { name: 'Steam Wallet Rp12.000', cost: 12000 },
    { name: 'Steam Wallet Rp45.000', cost: 45000, promo: true },
    { name: 'Steam Wallet Rp60.000', cost: 60000 },
    { name: 'Steam Wallet Rp90.000', cost: 90000 },
    { name: 'Steam Wallet Rp120.000', cost: 120000 },
    { name: 'Steam Wallet Rp250.000', cost: 250000 },
  ],
  'dota-2': [
    { name: 'Steam Wallet Rp12.000', cost: 12000 },
    { name: 'Steam Wallet Rp45.000', cost: 45000 },
    { name: 'Steam Wallet Rp60.000', cost: 60000, promo: true },
    { name: 'Steam Wallet Rp90.000', cost: 90000 },
    { name: 'Steam Wallet Rp120.000', cost: 120000 },
  ],
  'point-blank': [
    { name: '1.200 PB Cash', cost: 12000 },
    { name: '6.000 PB Cash', cost: 60000, promo: true },
    { name: '12.000 PB Cash', cost: 120000 },
    { name: '24.000 PB Cash', cost: 240000 },
    { name: '60.000 PB Cash', cost: 600000 },
  ],
  fortnite: [
    { name: '1000 V-Bucks', cost: 105000, promo: true },
    { name: '2800 V-Bucks', cost: 280000 },
    { name: '5000 V-Bucks', cost: 480000 },
    { name: '13500 V-Bucks', cost: 1250000 },
  ],
  'honor-of-kings': [
    { name: '80 Tokens', cost: 15000 },
    { name: '240 Tokens', cost: 45000, promo: true },
    { name: '400 Tokens', cost: 72000 },
    { name: '800 Tokens', cost: 145000 },
    { name: '1600 Tokens', cost: 285000 },
  ],
  'genshin-impact': [
    { name: '60 Genesis Crystals', cost: 15000 },
    { name: '300 + 30 Genesis Crystals', cost: 72000, promo: true },
    { name: '980 + 110 Genesis Crystals', cost: 235000 },
    { name: '1980 + 260 Genesis Crystals', cost: 470000 },
    { name: '3280 + 600 Genesis Crystals', cost: 780000 },
    { name: 'Blessing of the Welkin Moon', cost: 72000 },
  ],
  'call-of-duty-mobile': [
    { name: '80 CP', cost: 15000 },
    { name: '420 CP', cost: 75000, promo: true },
    { name: '880 CP', cost: 150000 },
    { name: '2400 CP', cost: 400000 },
    { name: '5000 CP', cost: 820000 },
  ],
  'league-of-legends': [
    { name: '575 RP', cost: 62000 },
    { name: '1200 RP', cost: 125000, promo: true },
    { name: '2500 RP', cost: 250000 },
    { name: '4000 RP', cost: 390000 },
    { name: '8150 RP', cost: 780000 },
  ],
  'wild-rift': [
    { name: '100 Wild Cores', cost: 15000 },
    { name: '400 Wild Cores', cost: 55000, promo: true },
    { name: '1000 Wild Cores', cost: 130000 },
    { name: '2000 Wild Cores', cost: 250000 },
    { name: '5000 Wild Cores', cost: 600000 },
  ],
  'arena-of-valor': [
    { name: '100 Vouchers', cost: 15000 },
    { name: '500 Vouchers', cost: 70000, promo: true },
    { name: '1000 Vouchers', cost: 135000 },
    { name: '2000 Vouchers', cost: 265000 },
  ],
  'clash-of-clans': [
    { name: '80 Gems', cost: 15000 },
    { name: '500 Gems', cost: 72000, promo: true },
    { name: '1200 Gems', cost: 150000 },
    { name: '2500 Gems', cost: 300000 },
    { name: '6500 Gems', cost: 750000 },
    { name: 'Gold Pass', cost: 78000 },
  ],
  'clash-royale': [
    { name: '80 Gems', cost: 15000 },
    { name: '500 Gems', cost: 72000, promo: true },
    { name: '1200 Gems', cost: 150000 },
    { name: '2500 Gems', cost: 300000 },
    { name: '6500 Gems', cost: 750000 },
    { name: 'Pass Royale', cost: 78000 },
  ],
  'ea-sports-fc-mobile': [
    { name: '100 FC Points', cost: 15000 },
    { name: '520 FC Points', cost: 72000, promo: true },
    { name: '1050 FC Points', cost: 145000 },
    { name: '2200 FC Points', cost: 290000 },
    { name: '5900 FC Points', cost: 750000 },
  ],
  efootball: [
    { name: '100 Coins', cost: 15000 },
    { name: '500 Coins', cost: 70000, promo: true },
    { name: '1000 Coins', cost: 135000 },
    { name: '2000 Coins', cost: 265000 },
  ],
  minecraft: [
    { name: '320 Minecoins', cost: 25000 },
    { name: '1020 Minecoins', cost: 75000, promo: true },
    { name: '1720 Minecoins', cost: 125000 },
    { name: '3500 Minecoins', cost: 250000 },
    { name: 'Java Edition', cost: 350000 },
  ],
  'steam-wallet': [
    { name: 'Steam Wallet Rp12.000', cost: 12000 },
    { name: 'Steam Wallet Rp45.000', cost: 45000, promo: true },
    { name: 'Steam Wallet Rp60.000', cost: 60000 },
    { name: 'Steam Wallet Rp90.000', cost: 90000 },
    { name: 'Steam Wallet Rp120.000', cost: 120000 },
    { name: 'Steam Wallet Rp250.000', cost: 250000 },
    { name: 'Steam Wallet Rp400.000', cost: 400000 },
    { name: 'Steam Wallet Rp600.000', cost: 600000 },
  ],
  'playstation-store': [
    { name: 'PlayStation Store Rp50.000', cost: 50000 },
    { name: 'PlayStation Store Rp100.000', cost: 100000, promo: true },
    { name: 'PlayStation Store Rp150.000', cost: 150000 },
    { name: 'PlayStation Store Rp250.000', cost: 250000 },
    { name: 'PlayStation Store Rp400.000', cost: 400000 },
  ],
  'nintendo-eshop': [
    { name: 'Nintendo eShop Rp50.000', cost: 50000 },
    { name: 'Nintendo eShop Rp100.000', cost: 100000, promo: true },
    { name: 'Nintendo eShop Rp250.000', cost: 250000 },
    { name: 'Nintendo eShop Rp500.000', cost: 500000 },
  ],
  'xbox-microsoft-store': [
    { name: 'Xbox Gift Card Rp50.000', cost: 50000 },
    { name: 'Xbox Gift Card Rp100.000', cost: 100000, promo: true },
    { name: 'Xbox Gift Card Rp150.000', cost: 150000 },
    { name: 'Xbox Gift Card Rp250.000', cost: 250000 },
    { name: 'Xbox Gift Card Rp500.000', cost: 500000 },
  ],
};

module.exports = { CATALOG, DEFAULT_MARGIN, PROMO_MARGIN };
