import { PALETTE } from './config.js';
import { createPlaceMarker, nearestPlace } from './places.js';

export const RESTAURANTS = [
  {
    id: 'casa-marea', name: 'Casa Marea', x: -108, z: 180,
    color: 0xe58962, roof: 0x693e48, width: 8, depth: 6,
    menu: [
      { name: 'Citrus Plantain Bites', price: 9, heal: 15 },
      { name: 'Ginger Fish Tacos', price: 21, heal: 30 },
      { name: 'Marea Seafood Rice', price: 39, heal: 50 },
    ],
  },
  {
    id: 'sunset-grill', name: 'Sunset Grill', x: 180, z: 108,
    color: 0xeab35b, roof: 0x794b35, width: 10, depth: 7,
    menu: [
      { name: 'Charred Lime Corn', price: 10, heal: 15 },
      { name: 'Sunset Pepper Burger', price: 23, heal: 30 },
      { name: 'Citrus Rib Platter', price: 44, heal: 50 },
    ],
  },
  {
    id: 'noodle-harbor', name: 'Noodle Harbor', x: -180, z: -108,
    color: 0xb286cb, roof: 0x414d66, width: 7.5, depth: 6.5,
    menu: [
      { name: 'Sesame Cucumber Cups', price: 8, heal: 15 },
      { name: 'Harbor Miso Noodles', price: 19, heal: 30 },
      { name: 'Chili Prawn Udon', price: 41, heal: 50 },
    ],
  },
  {
    id: 'pier-cafe', name: 'Pier Cafe', x: 108, z: -180,
    color: 0x71c7b4, roof: 0x344f59, width: 7, depth: 5,
    menu: [
      { name: 'Guava Hand Pie', price: 11, heal: 15 },
      { name: 'Smoked Pepper Toastie', price: 22, heal: 30 },
      { name: 'Pier Brunch Board', price: 36, heal: 50 },
    ],
  },
];

const RING = PALETTE.css.teal;

export function createRestaurants({ scene, player, hud }) {
  const list = RESTAURANTS.map(({ menu, ...restaurant }) => ({
    ...restaurant,
    menu: menu.map((item) => ({ ...item })),
  }));
  const byId = new Map(list.map((restaurant) => [restaurant.id, restaurant]));
  const state = { mealsEaten: 0 };

  for (const restaurant of list) {
    const { color, roof, width, depth } = restaurant;
    createPlaceMarker(scene, restaurant, { kind: 'restaurant', color, roof, ring: RING, width, depth });
  }

  function getMenu(id) {
    return byId.get(id)?.menu ?? [];
  }

  function eat(id, itemIndex, cash) {
    const restaurant = byId.get(id);
    const item = Number.isInteger(itemIndex) ? restaurant?.menu[itemIndex] : null;
    if (!item) return { ok: false, reason: 'This meal is not on the menu.', healed: 0, price: 0 };
    if (!Number.isFinite(cash) || cash < item.price) {
      return { ok: false, reason: 'You need more cash for this meal.', healed: 0, price: item.price };
    }

    const before = player.state.health;
    player.heal(item.heal);
    const healed = player.state.health - before;
    state.mealsEaten += 1;
    hud?.toast?.(`Ate ${item.name} at ${restaurant.name} +${Math.round(healed)} HP -$${item.price}`);
    return { ok: true, healed, price: item.price };
  }

  return {
    list,
    state,
    nearest: (x, z, radius = 5) => nearestPlace(list, x, z, radius),
    eat,
    getMenu,
    getBlips: () => list.map(({ x, z }) => ({ x, z, color: RING, size: 22 })),
    reset() { state.mealsEaten = 0; },
  };
}
