/**
 * Destination photography from Wikimedia Commons (freely licensed). Images are served by Wikimedia via
 * Special:FilePath; author and licence for each file are on its source page, linked from /legal/credits.
 */
const files: Record<string, string> = {
  lagos: "Lagos_skyline.jpg",
  abuja: "Abuja_skyline.jpg",
  kano: "Ancient_Kano_City_Walls,_Kano_State.jpg",
  ibadan: "Aerial_view_of_Ibadan_City_2.jpg",
  "port-harcourt": "Ikoku_Road,_Port_Harcourt.jpg",
  enugu: "Enugu.jpg",
  kaduna: "Kaduna_City_Center_29.jpg",
  jos: "Jos_city_Plateau_State.jpg",
  calabar: "Duke_Town,_Calabar,_Nigeria_-_panoramio.jpg",
  "benin-city": "A_panorama_of_Benin_city.jpg",
  uyo: "Dakkada_Towers,_Uyo,_Akwa_Ibom_State.jpg",
  sokoto: "Sultan's_palace_(Sokoto).JPG",
};

export const CITY_IMAGES: Record<string, { url: string; credit: string; source: string }> = Object.fromEntries(
  Object.entries(files).map(([city, file]) => [
    city,
    {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`,
      credit: "Wikimedia Commons",
      source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    },
  ]),
);
