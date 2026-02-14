import { RestaurantRepository } from "../restaurants/repository";
import { RestaurantConfigRepository } from "../restaurants/configRepository";
import { RestaurantConfig, Restaurant } from "../../types";

export function resolveRestaurantContext(toNumber: string): {
  restaurant_id: string;
  restaurant: Restaurant;
  config: RestaurantConfig;
} {
  const r = RestaurantRepository.getByWhatsappNumber(toNumber);
  if (!r) {
    throw new Error("Restaurante no configurado");
  }
  if (r.status !== "active") {
    throw new Error("Restaurante deshabilitado");
  }

  const config = RestaurantConfigRepository.get(r.id);
  return { restaurant_id: r.id, restaurant: r, config };
}
