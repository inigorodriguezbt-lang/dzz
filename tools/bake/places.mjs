// Hand-authored geography: islands, towns and cities, the highway graph, points of interest and
// map labels. Coordinates are real longitude / latitude; the bake projects them into the world.

export const ISLANDS = [
	{ id: 1, name: 'Niʻihau', lon: - 160.155, lat: 21.89, age: 0.8 },
	{ id: 2, name: 'Kauaʻi', lon: - 159.53, lat: 22.06, age: 1.0 },
	{ id: 3, name: 'Oʻahu', lon: - 157.98, lat: 21.47, age: 0.85 },
	{ id: 4, name: 'Molokaʻi', lon: - 157.02, lat: 21.13, age: 0.75 },
	{ id: 5, name: 'Lānaʻi', lon: - 156.93, lat: 20.83, age: 0.95 },
	{ id: 6, name: 'Maui', lon: - 156.33, lat: 20.80, age: 0.45 },
	{ id: 7, name: 'Kahoʻolawe', lon: - 156.61, lat: 20.55, age: 1.0 },
	{ id: 8, name: 'Hawaiʻi', lon: - 155.52, lat: 19.60, age: 0.1 },
];

// size: radius in game metres of the street grid; kind: 'metro' | 'town' | 'village' | 'resort' | 'military' | 'airport'
// angle: street grid rotation in degrees (0 = streets run east-west / north-south), roughly along the coast.
// core: fraction of the radius that is downtown (high-rise), beach: resort hotels along the shore.
export const CITIES = [
	// Oʻahu
	{ id: 'waikiki', name: 'Waikīkī', lon: - 157.829, lat: 21.281, size: 320, kind: 'resort', angle: 35, core: 0.6, beach: true, island: 3 },
	{ id: 'honolulu', name: 'Honolulu', lon: - 157.862, lat: 21.312, size: 600, kind: 'metro', angle: 25, core: 0.35, island: 3 },
	{ id: 'kaimuki', name: 'Kaimukī', lon: - 157.800, lat: 21.283, size: 300, kind: 'town', angle: 20, island: 3 },
	{ id: 'kalihi', name: 'Kalihi', lon: - 157.890, lat: 21.332, size: 300, kind: 'town', angle: 30, industrial: 0.4, island: 3 },
	{ id: 'manoa', name: 'Mānoa', lon: - 157.815, lat: 21.305, size: 240, kind: 'town', angle: 10, island: 3 },
	{ id: 'aiea', name: 'ʻAiea', lon: - 157.930, lat: 21.386, size: 260, kind: 'town', angle: 35, island: 3 },
	{ id: 'pearlcity', name: 'Pearl City', lon: - 157.970, lat: 21.400, size: 300, kind: 'town', angle: 20, island: 3 },
	{ id: 'waipahu', name: 'Waipahu', lon: - 158.010, lat: 21.389, size: 260, kind: 'town', angle: 15, industrial: 0.3, island: 3 },
	{ id: 'kapolei', name: 'Kapolei', lon: - 158.075, lat: 21.338, size: 300, kind: 'town', angle: 0, island: 3 },
	{ id: 'ewa', name: 'ʻEwa Beach', lon: - 158.005, lat: 21.318, size: 240, kind: 'town', angle: 0, island: 3 },
	{ id: 'mililani', name: 'Mililani', lon: - 158.015, lat: 21.452, size: 280, kind: 'town', angle: 30, island: 3 },
	{ id: 'wahiawa', name: 'Wahiawā', lon: - 158.022, lat: 21.500, size: 220, kind: 'town', angle: 10, island: 3 },
	{ id: 'haleiwa', name: 'Haleʻiwa', lon: - 158.103, lat: 21.592, size: 170, kind: 'village', angle: 45, beach: true, island: 3 },
	{ id: 'kaneohe', name: 'Kāneʻohe', lon: - 157.800, lat: 21.410, size: 290, kind: 'town', angle: 40, island: 3 },
	{ id: 'kailua', name: 'Kailua', lon: - 157.742, lat: 21.397, size: 290, kind: 'town', angle: 45, beach: true, island: 3 },
	{ id: 'hawaiikai', name: 'Hawaiʻi Kai', lon: - 157.705, lat: 21.290, size: 220, kind: 'town', angle: 10, island: 3 },
	{ id: 'waianae', name: 'Waiʻanae', lon: - 158.184, lat: 21.442, size: 180, kind: 'village', angle: 60, island: 3 },
	{ id: 'laie', name: 'Lāʻie', lon: - 157.925, lat: 21.646, size: 140, kind: 'village', angle: 50, island: 3 },
	{ id: 'schofield', name: 'Schofield Barracks', lon: - 158.062, lat: 21.494, size: 150, kind: 'military', angle: 0, island: 3 },
	{ id: 'pearlharbor', name: 'Pearl Harbor Naval Base', lon: - 157.945, lat: 21.352, size: 140, kind: 'military', angle: 45, island: 3 },
	{ id: 'mcbh', name: 'Kāneʻohe Bay Marine Base', lon: - 157.752, lat: 21.446, size: 110, kind: 'military', angle: 30, island: 3 },
	{ id: 'hnl', name: 'Honolulu International Airport', lon: - 157.922, lat: 21.325, size: 170, kind: 'airport', angle: 80, island: 3 },
	// Kauaʻi
	{ id: 'lihue', name: 'Līhuʻe', lon: - 159.370, lat: 21.978, size: 240, kind: 'town', angle: 20, island: 2 },
	{ id: 'kapaa', name: 'Kapaʻa', lon: - 159.320, lat: 22.075, size: 190, kind: 'town', angle: 20, beach: true, island: 2 },
	{ id: 'hanalei', name: 'Hanalei', lon: - 159.500, lat: 22.203, size: 80, kind: 'village', angle: 0, beach: true, island: 2 },
	{ id: 'princeville', name: 'Princeville', lon: - 159.482, lat: 22.217, size: 90, kind: 'resort', angle: 10, island: 2 },
	{ id: 'koloa', name: 'Kōloa', lon: - 159.466, lat: 21.895, size: 110, kind: 'resort', angle: 0, beach: true, island: 2 },
	{ id: 'hanapepe', name: 'Hanapēpē', lon: - 159.592, lat: 21.910, size: 80, kind: 'village', angle: 30, island: 2 },
	{ id: 'waimeak', name: 'Waimea', lon: - 159.668, lat: 21.960, size: 90, kind: 'village', angle: 30, island: 2 },
	{ id: 'pmrf', name: 'Pacific Missile Range Facility', lon: - 159.780, lat: 22.030, size: 110, kind: 'military', angle: 60, island: 2 },
	{ id: 'lih', name: 'Līhuʻe Airport', lon: - 159.345, lat: 21.978, size: 100, kind: 'airport', angle: 30, island: 2 },
	// Molokaʻi / Lānaʻi
	{ id: 'kaunakakai', name: 'Kaunakakai', lon: - 157.023, lat: 21.092, size: 130, kind: 'village', angle: 0, island: 4 },
	{ id: 'maunaloa', name: 'Maunaloa', lon: - 157.213, lat: 21.136, size: 60, kind: 'village', angle: 10, island: 4 },
	{ id: 'lanaicity', name: 'Lānaʻi City', lon: - 156.920, lat: 20.828, size: 130, kind: 'village', angle: 0, island: 5 },
	{ id: 'manele', name: 'Mānele Bay', lon: - 156.887, lat: 20.746, size: 55, kind: 'resort', angle: 20, beach: true, island: 5 },
	// Kahoʻolawe
	{ id: 'kahoolawe', name: 'Kahoʻolawe Range', lon: - 156.600, lat: 20.555, size: 70, kind: 'military', angle: 20, island: 7 },
	// Maui
	{ id: 'kahului', name: 'Kahului', lon: - 156.470, lat: 20.885, size: 300, kind: 'town', angle: 10, industrial: 0.25, island: 6 },
	{ id: 'wailuku', name: 'Wailuku', lon: - 156.503, lat: 20.890, size: 200, kind: 'town', angle: 15, island: 6 },
	{ id: 'lahaina', name: 'Lahaina', lon: - 156.680, lat: 20.877, size: 210, kind: 'town', angle: 70, beach: true, island: 6 },
	{ id: 'kaanapali', name: 'Kāʻanapali', lon: - 156.692, lat: 20.925, size: 110, kind: 'resort', angle: 80, beach: true, core: 0.6, island: 6 },
	{ id: 'kihei', name: 'Kīhei', lon: - 156.450, lat: 20.760, size: 250, kind: 'town', angle: 0, beach: true, island: 6 },
	{ id: 'wailea', name: 'Wailea', lon: - 156.441, lat: 20.688, size: 110, kind: 'resort', angle: 0, beach: true, core: 0.5, island: 6 },
	{ id: 'paia', name: 'Pāʻia', lon: - 156.370, lat: 20.909, size: 70, kind: 'village', angle: 30, island: 6 },
	{ id: 'pukalani', name: 'Pukalani', lon: - 156.338, lat: 20.838, size: 100, kind: 'village', angle: 30, island: 6 },
	{ id: 'hana', name: 'Hāna', lon: - 155.990, lat: 20.758, size: 70, kind: 'village', angle: 0, island: 6 },
	{ id: 'ogg', name: 'Kahului Airport', lon: - 156.432, lat: 20.898, size: 130, kind: 'airport', angle: 110, island: 6 },
	// Hawaiʻi
	{ id: 'hilo', name: 'Hilo', lon: - 155.090, lat: 19.715, size: 440, kind: 'metro', angle: 40, core: 0.2, island: 8 },
	{ id: 'kona', name: 'Kailua-Kona', lon: - 155.990, lat: 19.638, size: 330, kind: 'town', angle: 20, beach: true, core: 0.15, island: 8 },
	{ id: 'waimeabi', name: 'Waimea', lon: - 155.669, lat: 20.023, size: 200, kind: 'town', angle: 10, island: 8 },
	{ id: 'keaau', name: 'Keaʻau', lon: - 155.038, lat: 19.622, size: 140, kind: 'village', angle: 30, island: 8 },
	{ id: 'pahoa', name: 'Pāhoa', lon: - 154.946, lat: 19.495, size: 130, kind: 'village', angle: 30, island: 8 },
	{ id: 'volcano', name: 'Volcano', lon: - 155.235, lat: 19.432, size: 80, kind: 'village', angle: 40, island: 8 },
	{ id: 'naalehu', name: 'Nāʻālehu', lon: - 155.585, lat: 19.066, size: 70, kind: 'village', angle: 40, island: 8 },
	{ id: 'captaincook', name: 'Captain Cook', lon: - 155.918, lat: 19.498, size: 140, kind: 'village', angle: 20, island: 8 },
	{ id: 'waikoloa', name: 'Waikoloa', lon: - 155.800, lat: 19.920, size: 170, kind: 'village', angle: 30, island: 8 },
	{ id: 'waikoloabeach', name: 'Waikoloa Beach Resort', lon: - 155.884, lat: 19.918, size: 100, kind: 'resort', angle: 30, beach: true, core: 0.4, island: 8 },
	{ id: 'honokaa', name: 'Honokaʻa', lon: - 155.466, lat: 20.078, size: 80, kind: 'village', angle: 30, island: 8 },
	{ id: 'hawi', name: 'Hāwī', lon: - 155.833, lat: 20.238, size: 60, kind: 'village', angle: 0, island: 8 },
	{ id: 'kawaihae', name: 'Kawaihae Harbor', lon: - 155.826, lat: 20.038, size: 70, kind: 'village', angle: 20, industrial: 0.6, island: 8 },
	{ id: 'pta', name: 'Pōhakuloa Training Area', lon: - 155.555, lat: 19.757, size: 150, kind: 'military', angle: 20, island: 8 },
	{ id: 'koa', name: 'Kona International Airport', lon: - 156.043, lat: 19.738, size: 130, kind: 'airport', angle: 170, island: 8 },
	{ id: 'ito', name: 'Hilo International Airport', lon: - 155.046, lat: 19.720, size: 110, kind: 'airport', angle: 80, island: 8 },
	{ id: 'maunakea', name: 'Mauna Kea Observatories', lon: - 155.472, lat: 19.823, size: 60, kind: 'observatory', angle: 0, island: 8 },
	// Niʻihau
	{ id: 'puuwai', name: 'Puʻuwai', lon: - 160.197, lat: 21.902, size: 45, kind: 'village', angle: 0, island: 1 },
];

// highway nodes: towns reuse the city ids above, the rest are junctions and road ends
export const NODES = {
	// Kauaʻi
	polihale: [ - 159.760, 22.075 ], kekaha: [ - 159.718, 21.968 ], kokee: [ - 159.657, 22.130 ], kalalau: [ - 159.648, 22.150 ],
	kalaheo: [ - 159.527, 21.925 ], kilauea: [ - 159.406, 22.210 ], keebeach: [ - 159.581, 22.220 ], poipu: [ - 159.458, 21.878 ],
	// Oʻahu
	makapuu: [ - 157.664, 21.310 ], waimanalo: [ - 157.713, 21.343 ], kahaluu: [ - 157.845, 21.460 ], kaaawa: [ - 157.852, 21.555 ],
	kahuku: [ - 157.951, 21.680 ], sunset: [ - 158.040, 21.672 ], waialua: [ - 158.130, 21.577 ], mokuleia: [ - 158.225, 21.580 ],
	kaenaw: [ - 158.235, 21.535 ], makaha: [ - 158.217, 21.469 ], nanakuli: [ - 158.154, 21.390 ], kahala: [ - 157.774, 21.272 ],
	nuuanu: [ - 157.815, 21.360 ], diamondhead: [ - 157.806, 21.262 ], h3mid: [ - 157.845, 21.395 ],
	// Molokaʻi
	kaluakoi: [ - 157.255, 21.168 ], hoolehua: [ - 157.093, 21.152 ], kualapuu: [ - 157.037, 21.155 ], halawa: [ - 156.742, 21.158 ],
	pukoo: [ - 156.800, 21.070 ],
	// Lānaʻi
	kaumalapau: [ - 156.987, 20.787 ], keomuku: [ - 156.890, 20.905 ], gardengods: [ - 156.955, 20.878 ],
	// Maui
	kapalua: [ - 156.667, 21.000 ], kahakuloa: [ - 156.557, 21.002 ], waihee: [ - 156.506, 20.953 ], olowalu: [ - 156.623, 20.810 ],
	maalaea: [ - 156.510, 20.793 ], makena: [ - 156.445, 20.634 ], ulupalakua: [ - 156.400, 20.650 ], kaupo: [ - 156.135, 20.640 ],
	kipahulu: [ - 156.048, 20.663 ], nahiku: [ - 156.120, 20.825 ], haiku: [ - 156.325, 20.918 ], makawao: [ - 156.313, 20.856 ],
	kula: [ - 156.326, 20.790 ], haleakala: [ - 156.250, 20.713 ],
	// Hawaiʻi
	honomu: [ - 155.114, 19.871 ], laupahoehoe: [ - 155.241, 19.993 ], waipio: [ - 155.584, 20.117 ], kalapana: [ - 154.973, 19.352 ],
	pahala: [ - 155.478, 19.202 ], southpoint: [ - 155.681, 18.920 ], oceanview: [ - 155.765, 19.117 ], kealakekua: [ - 155.923, 19.520 ],
	saddlewest: [ - 155.690, 19.795 ], saddlemid: [ - 155.458, 19.765 ], saddleeast: [ - 155.270, 19.705 ], mkaccess: [ - 155.462, 19.790 ],
	kohala: [ - 155.760, 20.150 ], kilaueacrater: [ - 155.275, 19.418 ], puna: [ - 154.860, 19.480 ], hookena: [ - 155.890, 19.380 ],
	// Niʻihau
	niihaun: [ - 160.100, 22.000 ], niihaus: [ - 160.110, 21.800 ],
};

// highways: [ from, to, lanes ] where lanes 4 = freeway, 2 = highway, 1 = rural / dirt
export const EDGES = [
	// Kauaʻi — Kaumualiʻi and Kūhiō highways, Waimea Canyon Drive
	[ 'polihale', 'pmrf', 1 ], [ 'pmrf', 'kekaha', 2 ], [ 'kekaha', 'waimeak', 2 ], [ 'waimeak', 'hanapepe', 2 ], [ 'hanapepe', 'kalaheo', 2 ],
	[ 'kalaheo', 'lihue', 2 ], [ 'kalaheo', 'koloa', 2 ], [ 'koloa', 'poipu', 2 ], [ 'koloa', 'lihue', 2 ], [ 'lihue', 'lih', 2 ],
	[ 'lihue', 'kapaa', 2 ], [ 'kapaa', 'kilauea', 2 ], [ 'kilauea', 'princeville', 2 ], [ 'princeville', 'hanalei', 2 ], [ 'hanalei', 'keebeach', 1 ],
	[ 'waimeak', 'kokee', 2 ], [ 'kokee', 'kalalau', 1 ],
	// Oʻahu — H-1, H-2, H-3, Pali, Kamehameha, Farrington, Kalanianaʻole
	[ 'kapolei', 'waipahu', 4 ], [ 'waipahu', 'pearlcity', 4 ], [ 'pearlcity', 'aiea', 4 ], [ 'aiea', 'hnl', 4 ], [ 'hnl', 'kalihi', 4 ],
	[ 'kalihi', 'honolulu', 4 ], [ 'honolulu', 'waikiki', 2 ], [ 'honolulu', 'manoa', 2 ], [ 'waikiki', 'kaimuki', 2 ], [ 'kaimuki', 'kahala', 4 ],
	[ 'waikiki', 'diamondhead', 2 ], [ 'diamondhead', 'kahala', 2 ],
	[ 'kahala', 'hawaiikai', 2 ], [ 'hawaiikai', 'makapuu', 2 ], [ 'makapuu', 'waimanalo', 2 ], [ 'waimanalo', 'kailua', 2 ], [ 'kailua', 'kaneohe', 2 ],
	[ 'kailua', 'mcbh', 2 ], [ 'kaneohe', 'kahaluu', 2 ], [ 'kahaluu', 'kaaawa', 2 ], [ 'kaaawa', 'laie', 2 ], [ 'laie', 'kahuku', 2 ],
	[ 'kahuku', 'sunset', 2 ], [ 'sunset', 'haleiwa', 2 ], [ 'haleiwa', 'waialua', 2 ], [ 'waialua', 'mokuleia', 1 ], [ 'haleiwa', 'wahiawa', 2 ],
	[ 'wahiawa', 'schofield', 2 ], [ 'wahiawa', 'mililani', 4 ], [ 'mililani', 'pearlcity', 4 ], [ 'honolulu', 'nuuanu', 2 ], [ 'nuuanu', 'kailua', 2 ],
	[ 'aiea', 'h3mid', 4 ], [ 'h3mid', 'kaneohe', 4 ], [ 'kapolei', 'nanakuli', 2 ], [ 'nanakuli', 'waianae', 2 ], [ 'waianae', 'makaha', 2 ],
	[ 'makaha', 'kaenaw', 1 ], [ 'kapolei', 'ewa', 2 ], [ 'pearlcity', 'pearlharbor', 2 ], [ 'waipahu', 'ewa', 2 ],
	// Molokaʻi
	[ 'kaluakoi', 'maunaloa', 2 ], [ 'maunaloa', 'hoolehua', 2 ], [ 'hoolehua', 'kaunakakai', 2 ], [ 'hoolehua', 'kualapuu', 2 ],
	[ 'kualapuu', 'kaunakakai', 2 ], [ 'kaunakakai', 'pukoo', 2 ], [ 'pukoo', 'halawa', 1 ],
	// Lānaʻi
	[ 'lanaicity', 'manele', 2 ], [ 'lanaicity', 'kaumalapau', 2 ], [ 'lanaicity', 'keomuku', 1 ], [ 'lanaicity', 'gardengods', 1 ],
	// Maui — Honoapiʻilani, Kahekili, Piʻilani, Hāna, Haleakalā
	[ 'kapalua', 'kaanapali', 2 ], [ 'kaanapali', 'lahaina', 2 ], [ 'lahaina', 'olowalu', 2 ], [ 'olowalu', 'maalaea', 2 ], [ 'maalaea', 'wailuku', 2 ],
	[ 'wailuku', 'kahului', 2 ], [ 'kahului', 'ogg', 2 ], [ 'maalaea', 'kihei', 2 ], [ 'kihei', 'wailea', 2 ], [ 'wailea', 'makena', 2 ],
	[ 'makena', 'ulupalakua', 1 ], [ 'ulupalakua', 'kula', 2 ], [ 'ulupalakua', 'kaupo', 1 ], [ 'kaupo', 'kipahulu', 1 ], [ 'kipahulu', 'hana', 2 ],
	[ 'hana', 'nahiku', 2 ], [ 'nahiku', 'haiku', 2 ], [ 'haiku', 'paia', 2 ], [ 'paia', 'kahului', 2 ], [ 'kahului', 'pukalani', 4 ],
	[ 'pukalani', 'makawao', 2 ], [ 'makawao', 'paia', 2 ], [ 'pukalani', 'kula', 2 ], [ 'kula', 'haleakala', 2 ], [ 'kihei', 'kahului', 4 ],
	[ 'kapalua', 'kahakuloa', 1 ], [ 'kahakuloa', 'waihee', 1 ], [ 'waihee', 'wailuku', 2 ],
	// Hawaiʻi — Māmalahoa belt road, Saddle Road, Kohala, Puna
	[ 'hilo', 'ito', 2 ], [ 'hilo', 'keaau', 4 ], [ 'keaau', 'volcano', 2 ], [ 'volcano', 'kilaueacrater', 2 ], [ 'volcano', 'pahala', 2 ],
	[ 'pahala', 'naalehu', 2 ], [ 'naalehu', 'southpoint', 1 ], [ 'naalehu', 'oceanview', 2 ], [ 'oceanview', 'hookena', 2 ], [ 'hookena', 'captaincook', 2 ],
	[ 'captaincook', 'kealakekua', 2 ], [ 'kealakekua', 'kona', 2 ], [ 'kona', 'koa', 2 ], [ 'koa', 'waikoloabeach', 2 ], [ 'waikoloabeach', 'kawaihae', 2 ],
	[ 'kawaihae', 'kohala', 2 ], [ 'kohala', 'hawi', 2 ], [ 'kawaihae', 'waimeabi', 2 ], [ 'waimeabi', 'waikoloa', 2 ], [ 'waikoloa', 'waikoloabeach', 2 ],
	[ 'waimeabi', 'honokaa', 2 ], [ 'honokaa', 'waipio', 1 ], [ 'honokaa', 'laupahoehoe', 2 ], [ 'laupahoehoe', 'honomu', 2 ], [ 'honomu', 'hilo', 2 ],
	[ 'keaau', 'pahoa', 2 ], [ 'pahoa', 'kalapana', 1 ], [ 'pahoa', 'puna', 1 ], [ 'hilo', 'saddleeast', 2 ], [ 'saddleeast', 'saddlemid', 2 ],
	[ 'saddlemid', 'pta', 2 ], [ 'pta', 'saddlewest', 2 ], [ 'saddlewest', 'waikoloa', 2 ], [ 'saddlemid', 'mkaccess', 1 ], [ 'mkaccess', 'maunakea', 1 ],
	[ 'kohala', 'waimeabi', 2 ],
	// Niʻihau dirt tracks
	[ 'niihaun', 'puuwai', 1 ], [ 'puuwai', 'niihaus', 1 ],
];

// named features for the map
export const LABELS = [
	{ name: 'Mauna Kea', lon: - 155.468, lat: 19.821, kind: 'peak' },
	{ name: 'Mauna Loa', lon: - 155.608, lat: 19.475, kind: 'peak' },
	{ name: 'Hualālai', lon: - 155.865, lat: 19.692, kind: 'peak' },
	{ name: 'Kīlauea', lon: - 155.285, lat: 19.406, kind: 'peak' },
	{ name: 'Kohala', lon: - 155.717, lat: 20.086, kind: 'peak' },
	{ name: 'Haleakalā', lon: - 156.253, lat: 20.710, kind: 'peak' },
	{ name: 'Puʻu Kukui', lon: - 156.590, lat: 20.890, kind: 'peak' },
	{ name: 'Kaʻala', lon: - 158.143, lat: 21.509, kind: 'peak' },
	{ name: 'Koʻolau Range', lon: - 157.800, lat: 21.400, kind: 'range' },
	{ name: 'Waiʻanae Range', lon: - 158.150, lat: 21.470, kind: 'range' },
	{ name: 'Diamond Head', lon: - 157.806, lat: 21.262, kind: 'peak' },
	{ name: 'Waiʻaleʻale', lon: - 159.498, lat: 22.074, kind: 'peak' },
	{ name: 'Waimea Canyon', lon: - 159.662, lat: 22.070, kind: 'area' },
	{ name: 'Nā Pali Coast', lon: - 159.620, lat: 22.180, kind: 'area' },
	{ name: 'Kalaupapa', lon: - 156.985, lat: 21.192, kind: 'area' },
	{ name: 'Pearl Harbor', lon: - 157.965, lat: 21.365, kind: 'water' },
	{ name: 'Kāneʻohe Bay', lon: - 157.810, lat: 21.470, kind: 'water' },
	{ name: 'Kaʻiwi Channel', lon: - 157.450, lat: 21.250, kind: 'water' },
	{ name: 'Kauaʻi Channel', lon: - 158.700, lat: 21.750, kind: 'water' },
	{ name: 'ʻAlenuihāhā Channel', lon: - 155.950, lat: 20.380, kind: 'water' },
	{ name: 'ʻAuʻau Channel', lon: - 156.760, lat: 20.900, kind: 'water' },
	{ name: 'Pailolo Channel', lon: - 156.740, lat: 21.060, kind: 'water' },
	{ name: 'Kaʻū Desert', lon: - 155.380, lat: 19.330, kind: 'area' },
	{ name: 'Puna', lon: - 154.930, lat: 19.420, kind: 'area' },
	{ name: 'Hāmākua Coast', lon: - 155.330, lat: 20.020, kind: 'area' },
	{ name: 'Kona Coast', lon: - 155.990, lat: 19.450, kind: 'area' },
	{ name: 'Ka Lae', lon: - 155.681, lat: 18.913, kind: 'area' },
	{ name: 'Kaʻena Point', lon: - 158.281, lat: 21.575, kind: 'area' },
	{ name: 'North Shore', lon: - 158.060, lat: 21.650, kind: 'area' },
	{ name: 'Hanauma Bay', lon: - 157.694, lat: 21.270, kind: 'water' },
	{ name: 'Molokini', lon: - 156.497, lat: 20.632, kind: 'area' },
	{ name: 'Waipiʻo Valley', lon: - 155.600, lat: 20.110, kind: 'area' },
	{ name: 'Garden of the Gods', lon: - 156.955, lat: 20.878, kind: 'area' },
];

// lava vents: flows are traced downhill from these in the bake; age 0 = fresh black lava
export const VENTS = [
	{ lon: - 155.281, lat: 19.408, width: 1.0, len: 1.0, age: 0.1, count: 7 }, // Kīlauea caldera
	{ lon: - 155.105, lat: 19.388, width: 0.9, len: 1.2, age: 0.0, count: 6 }, // Puʻu ʻŌʻō
	{ lon: - 154.910, lat: 19.462, width: 0.8, len: 0.8, age: 0.0, count: 4 }, // Leilani (2018)
	{ lon: - 155.608, lat: 19.475, width: 1.2, len: 1.8, age: 0.2, count: 10 }, // Mauna Loa summit
	{ lon: - 155.470, lat: 19.560, width: 1.0, len: 1.6, age: 0.3, count: 5 }, // Mauna Loa NE rift
	{ lon: - 155.700, lat: 19.300, width: 1.0, len: 1.5, age: 0.15, count: 6 }, // Mauna Loa SW rift
	{ lon: - 155.867, lat: 19.690, width: 0.7, len: 1.2, age: 0.4, count: 4 }, // Hualālai (1801)
	{ lon: - 155.380, lat: 19.340, width: 1.0, len: 0.7, age: 0.3, count: 5 }, // Kaʻū desert
];

// broad land-use patches: 1 pineapple, 2 sugar cane, 3 ranch pasture
export const LANDUSE = [
	{ lon: - 158.040, lat: 21.545, r: 520, use: 1 }, // Wahiawā–Haleʻiwa pineapple
	{ lon: - 157.975, lat: 21.505, r: 360, use: 1 },
	{ lon: - 156.925, lat: 20.810, r: 330, use: 1 }, // Lānaʻi
	{ lon: - 156.440, lat: 20.840, r: 480, use: 2 }, // central Maui cane
	{ lon: - 159.450, lat: 21.940, r: 380, use: 2 }, // Kauaʻi south
	{ lon: - 155.300, lat: 20.010, r: 420, use: 2 }, // Hāmākua
	{ lon: - 155.620, lat: 20.000, r: 600, use: 3 }, // Parker Ranch
	{ lon: - 156.380, lat: 20.680, r: 380, use: 3 }, // ʻUlupalakua
	{ lon: - 157.120, lat: 21.140, r: 450, use: 3 }, // Molokaʻi ranch
];
