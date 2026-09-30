// Shop and building signs: a fixed list of fictional, local-feeling names drawn once into one canvas atlas
// (512 x 64 px slots, 4 per row). Plain data plus a deterministic pick, so the building worker (which lays out
// the sign quads and their uvs) and the main thread (which paints the atlas) agree on every sign.
import { hash32 } from './data.js';

export const SIGN_W = 512, SIGN_H = 64, SIGN_COLS = 4;

// style: 'panel' solid board with lettering, 'band' board with an accent band, 'box' lettering on a light board
// with a coloured logo box, 'serif' classic painted board, 'channel' bare letters on a dark fascia
export const SIGNS = [];
const BY = {};
function add( kind, text, bg, fg, style = 'panel', sub = '', accent = null ) {
	const idx = SIGNS.length;
	SIGNS.push( { kind, text, sub, bg, fg, style, accent: accent || fg } );
	( BY[ kind ] = BY[ kind ] || [] ).push( idx );
}

const WHITE = [ 246, 244, 238 ], CREAM = [ 240, 230, 206 ], BLACK = [ 28, 28, 30 ], RED = [ 176, 36, 32 ], NAVY = [ 26, 46, 92 ];
const GREEN = [ 30, 104, 64 ], TEAL = [ 22, 118, 124 ], ORANGE = [ 220, 110, 30 ], YELLOW = [ 244, 196, 48 ], BLUE = [ 34, 86, 160 ];
const BROWN = [ 96, 60, 36 ], PURPLE = [ 98, 52, 110 ], PINK = [ 214, 96, 140 ], GREY = [ 70, 72, 76 ];

add( 'convenience', 'Aloha Mart', RED, WHITE, 'band', '', YELLOW );
add( 'convenience', 'Kokua Market', GREEN, WHITE, 'panel' );
add( 'convenience', 'Mauka Mini Mart', WHITE, RED, 'box', '', RED );
add( 'convenience', 'Makai Food Mart', BLUE, WHITE, 'band', '', ORANGE );
add( 'convenience', 'Ohana Stop', ORANGE, WHITE, 'panel' );
add( 'convenience', 'Island Quick Stop', YELLOW, NAVY, 'band', '', RED );
add( 'convenience', 'Shaka Mart', TEAL, WHITE, 'panel' );
add( 'grocery', 'Pali Foods', GREEN, WHITE, 'channel' );
add( 'grocery', 'Island Fresh Market', WHITE, GREEN, 'box', '', GREEN );
add( 'grocery', 'Kamaaina Foods', RED, WHITE, 'channel' );
add( 'grocery', 'Paradise Grocers', NAVY, WHITE, 'channel' );
add( 'pharmacy', 'Kokua Drugs', WHITE, RED, 'box', 'Pharmacy', RED );
add( 'pharmacy', 'Lokahi Pharmacy', BLUE, WHITE, 'panel' );
add( 'pharmacy', 'Malama Drug', WHITE, GREEN, 'box', 'Pharmacy', GREEN );
add( 'hardware', 'Pacific Hardware', RED, WHITE, 'channel' );
add( 'hardware', 'Hale Builders Supply', YELLOW, BLACK, 'band', '', BLACK );
add( 'hardware', 'Island Lumber', GREEN, CREAM, 'channel' );
add( 'gunstore', 'Koolau Firearms', BLACK, WHITE, 'band', 'Guns - Ammo', RED );
add( 'gunstore', 'Pacific Arms', GREY, WHITE, 'panel', 'Firearms' );
add( 'gunstore', 'Makai Tactical', [ 64, 70, 48 ], CREAM, 'panel' );
add( 'gunstore', 'Island Guns', WHITE, BLACK, 'box', 'Ammo', RED );
add( 'clothing', 'Aloha Threads', PINK, WHITE, 'serif' );
add( 'clothing', 'Island Style', TEAL, WHITE, 'serif' );
add( 'clothing', 'Pua Boutique', CREAM, PURPLE, 'serif' );
add( 'clothing', 'Mahina Wear', WHITE, NAVY, 'serif' );
add( 'clothing', 'Palm Tree Apparel', GREEN, WHITE, 'panel' );
add( 'sports', 'Summit Outdoors', NAVY, WHITE, 'band', '', ORANGE );
add( 'sports', 'Kai Athletics', RED, WHITE, 'panel' );
add( 'sports', 'Pacific Sporting Goods', GREEN, WHITE, 'band', '', YELLOW );
add( 'surf', 'Pipeline Surf Co.', TEAL, WHITE, 'serif' );
add( 'surf', 'Nalu Surf Shop', YELLOW, BLUE, 'panel' );
add( 'surf', 'Kai Boards', BLUE, WHITE, 'serif' );
add( 'surf', 'Point Break Surf', ORANGE, WHITE, 'panel' );
add( 'restaurant', 'Ono Grindz', RED, CREAM, 'serif' );
add( 'restaurant', "Aunty's Kitchen", CREAM, BROWN, 'serif' );
add( 'restaurant', 'Paniolo Steakhouse', BROWN, CREAM, 'serif' );
add( 'restaurant', 'Lanai Cafe', WHITE, TEAL, 'serif' );
add( 'restaurant', 'Sakura Teishoku', BLACK, [ 236, 200, 120 ], 'serif' );
add( 'restaurant', 'Golden Dragon', RED, YELLOW, 'serif' );
add( 'restaurant', 'Pho Saigon', YELLOW, RED, 'panel' );
add( 'restaurant', 'Seoul BBQ', BLACK, RED, 'panel' );
add( 'restaurant', 'Kuhio Grill', NAVY, CREAM, 'serif' );
add( 'restaurant', 'Da Plate Lunch', GREEN, YELLOW, 'panel' );
add( 'bar', 'The Tiki Lounge', BROWN, YELLOW, 'serif' );
add( 'bar', 'Lava Bar', BLACK, ORANGE, 'panel' );
add( 'bar', 'Mai Tai Bar', TEAL, PINK, 'serif' );
add( 'bar', 'Kona Tap Room', GREEN, CREAM, 'serif' );
add( 'bar', 'The Reef', NAVY, TEAL, 'panel' );
add( 'bar', 'Trade Winds Tavern', CREAM, BROWN, 'serif' );
add( 'fastfood', 'Burger Hale', RED, YELLOW, 'band', '', YELLOW );
add( 'fastfood', 'Spam Shack', BLUE, YELLOW, 'panel' );
add( 'fastfood', 'Musubi Express', WHITE, RED, 'box', '', RED );
add( 'fastfood', 'Katsu Co.', ORANGE, WHITE, 'panel' );
add( 'fastfood', 'Taco Kai', YELLOW, GREEN, 'band', '', GREEN );
add( 'fastfood', 'Pizza Luau', RED, WHITE, 'panel' );
add( 'gas', 'Pacific Fuel', BLUE, WHITE, 'band', '', RED );
add( 'gas', 'Aloha Gas', RED, WHITE, 'band', '', YELLOW );
add( 'gas', 'Island Petroleum', GREEN, WHITE, 'band', '', YELLOW );
add( 'gas', 'Hele Fuel', ORANGE, WHITE, 'band', '', NAVY );
add( 'bank', 'First Island Bank', NAVY, WHITE, 'channel' );
add( 'bank', 'Pacific Savings', GREEN, WHITE, 'channel' );
add( 'bank', 'Ohana Credit Union', TEAL, WHITE, 'channel' );
add( 'post', 'Post Office', WHITE, NAVY, 'box', '', RED );
add( 'pawn', 'Kala Pawn', YELLOW, BLACK, 'panel', 'Gold - Guns - Tools' );
add( 'pawn', 'Island Pawn', BLACK, YELLOW, 'panel', 'We Buy Gold' );
add( 'pawn', 'Aloha Pawn', RED, WHITE, 'panel' );
add( 'market', 'Farmers Market', GREEN, CREAM, 'serif' );
add( 'market', 'Swap Meet', ORANGE, WHITE, 'panel' );
add( 'garage', 'Island Auto Repair', BLUE, WHITE, 'band', '', RED );
add( 'garage', 'Kalani Tire & Auto', RED, WHITE, 'panel' );
add( 'garage', 'Pono Auto Body', YELLOW, BLACK, 'panel' );
add( 'hotel', 'Royal Kai Hotel', CREAM, [ 150, 110, 50 ], 'serif' );
add( 'hotel', 'Palm Crest Hotel', WHITE, TEAL, 'serif' );
add( 'hotel', 'Pacific Surf Hotel', NAVY, WHITE, 'serif' );
add( 'hotel', 'Coral Reef Hotel', WHITE, [ 210, 100, 80 ], 'serif' );
add( 'hotel', 'Diamond View Resort', WHITE, NAVY, 'serif' );
add( 'hotel', 'Sunset Kai', CREAM, ORANGE, 'serif' );
add( 'hotel', 'Plumeria Suites', WHITE, PINK, 'serif' );
add( 'hotel', 'Hale Nalu Resort', WHITE, GREEN, 'serif' );
add( 'office', 'Pacific Tower', GREY, WHITE, 'channel' );
add( 'office', 'Harbor Center', NAVY, WHITE, 'channel' );
add( 'office', 'Makai Tower', GREY, WHITE, 'channel' );
add( 'office', 'Summit Center', BLACK, WHITE, 'channel' );
add( 'office', 'Island Trust', NAVY, [ 220, 190, 120 ], 'channel' );
add( 'office', 'Merchant Plaza', GREY, WHITE, 'channel' );
add( 'apartment', 'Kalia Gardens', WHITE, GREEN, 'serif' );
add( 'apartment', 'Mauka Vista', CREAM, BROWN, 'serif' );
add( 'apartment', 'Makani Terrace', WHITE, NAVY, 'serif' );
add( 'apartment', 'The Palms', WHITE, TEAL, 'serif' );
add( 'apartment', 'Lanakila Court', CREAM, NAVY, 'serif' );
add( 'police', 'Police', NAVY, WHITE, 'box', 'Station', BLUE );
add( 'police', 'Police Department', NAVY, WHITE, 'panel' );
add( 'fire', 'Fire Station', RED, WHITE, 'panel' );
add( 'fire', 'Fire Department', RED, WHITE, 'panel' );
add( 'hospital', 'Medical Center', WHITE, BLUE, 'box', '', RED );
add( 'hospital', 'Emergency', RED, WHITE, 'panel' );
add( 'clinic', 'Health Clinic', WHITE, TEAL, 'box', '', TEAL );
add( 'clinic', 'Urgent Care', WHITE, RED, 'box', '', RED );
add( 'clinic', 'Family Health Center', TEAL, WHITE, 'panel' );
add( 'school', 'Kalani Elementary', CREAM, GREEN, 'serif' );
add( 'school', 'Pali High School', CREAM, NAVY, 'serif' );
add( 'school', 'Waiola Elementary', CREAM, RED, 'serif' );
add( 'school', 'Aloha Intermediate', CREAM, PURPLE, 'serif' );
add( 'church', 'Holy Cross Church', WHITE, BLACK, 'serif' );
add( 'church', 'Grace Chapel', WHITE, NAVY, 'serif' );
add( 'church', 'St. Joseph Church', CREAM, BROWN, 'serif' );
add( 'church', 'Calvary Church', WHITE, BROWN, 'serif' );
add( 'mil_hq', 'Headquarters', [ 64, 70, 48 ], CREAM, 'panel' );
add( 'armory', 'Armory', [ 64, 70, 48 ], CREAM, 'panel', 'Authorized Personnel Only' );
add( 'warehouse', 'Pacific Freight', BLUE, WHITE, 'panel' );
add( 'warehouse', 'Harbor Storage', GREY, YELLOW, 'panel' );
add( 'warehouse', 'Kai Shipping', TEAL, WHITE, 'panel' );
// strip-mall neighbours
add( 'laundromat', 'Coin Laundry', BLUE, WHITE, 'panel' );
add( 'laundromat', 'Suds Laundromat', TEAL, WHITE, 'panel' );
add( 'nails', 'Lani Nails', PINK, WHITE, 'serif' );
add( 'nails', 'Pretty Nails', WHITE, PINK, 'serif' );
add( 'barber', 'Barber Shop', WHITE, RED, 'box', '', BLUE );
add( 'barber', 'Kai Cuts', BLACK, WHITE, 'panel' );
add( 'takeout', 'Plate Lunch', YELLOW, RED, 'panel' );
add( 'takeout', 'Manapua Shop', RED, WHITE, 'panel' );
add( 'takeout', 'Poke Stop', TEAL, WHITE, 'panel' );
add( 'takeout', 'Bento Box', WHITE, BLACK, 'box', '', RED );
add( 'vacant', 'For Lease', WHITE, RED, 'panel' );
add( 'insurance', 'Island Insurance', WHITE, NAVY, 'box', '', BLUE );
add( 'insurance', 'Tax & Insurance', NAVY, WHITE, 'panel' );
add( 'phone', 'Phone Repair', BLACK, [ 110, 200, 240 ], 'panel' );
add( 'phone', 'Wireless Hawaii', WHITE, BLUE, 'box', '', BLUE );
add( 'bakery', 'Malasada Bakery', CREAM, BROWN, 'serif' );
add( 'bakery', 'Sweet Bread Bakery', PINK, WHITE, 'serif' );

add( 'terminal', 'Departures', NAVY, WHITE, 'band', '', YELLOW );
add( 'terminal', 'Arrivals', NAVY, WHITE, 'band', '', YELLOW );

export const SIGN_ROWS = Math.ceil( SIGNS.length / SIGN_COLS );
export const ATLAS_W = SIGN_W * SIGN_COLS, ATLAS_H = SIGN_H * SIGN_ROWS;

// the index of the sign with this text (-1 if none)
export function signIndex( text ) { return SIGNS.findIndex( s => s.text === text ); }

// shop kinds that live in strip-mall units but have no sign list of their own
const ALIAS = { sports: 'sports', shed: null, tent: null, observatory: null, barracks: null, terminal: null, tower: null };

// the sign for a building (unit u of a strip mall, or 0), or null when it has none
export function signFor( P, u, kind ) {
	const k = kind in ALIAS ? ALIAS[ kind ] : kind;
	const list = k && BY[ k ];
	if ( ! list ) return null;
	const h = hash32( P.bid, u, 0x5167 );
	// not every walk-up or office has a name board
	if ( ( k === 'apartment' || k === 'office' ) && P.S.arch !== 'tower' && ( h >> 12 ) % 3 !== 0 ) return null;
	const idx = list[ h % list.length ];
	const s = SIGNS[ idx ];
	const out = { idx, board: s.style === 'channel' ? darken( s.bg, 0.55 ) : s.bg };
	if ( P.S.arch === 'tower' && ( k === 'hotel' || k === 'office' ) ) out.top = out;
	return out;
}
const darken = ( c, k ) => [ Math.round( c[ 0 ] * k ), Math.round( c[ 1 ] * k ), Math.round( c[ 2 ] * k ) ];

// atlas uv rect of a sign [ u0, v0, u1, v1 ] (v up, flipY texture), cropped to a board aspect w / h
export function signUV( idx, aspect = SIGN_W / SIGN_H ) {
	const col = idx % SIGN_COLS, row = Math.floor( idx / SIGN_COLS );
	const slotAsp = SIGN_W / SIGN_H;
	const cu = Math.min( 1, aspect / slotAsp );
	const inset = 0.5 / SIGN_W;
	const u0 = ( col + 0.5 - cu / 2 ) / SIGN_COLS + inset, u1 = ( col + 0.5 + cu / 2 ) / SIGN_COLS - inset;
	// canvas row 0 is at the top; with flipY the texture's v = 1 is the canvas top
	const v1 = 1 - row / SIGN_ROWS - 0.5 / ATLAS_H, v0 = 1 - ( row + 1 ) / SIGN_ROWS + 0.5 / ATLAS_H;
	return [ u0, v0, u1, v1 ];
}

// ---- main thread: paint the atlas ----------------------------------------------------------------------------

const css = ( c, a = 1 ) => `rgba(${c[ 0 ]},${c[ 1 ]},${c[ 2 ]},${a})`;
const FONTS = {
	sans: '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", sans-serif',
	serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
	cond: '"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif',
};

export function paintSignAtlas( canvas ) {
	canvas.width = ATLAS_W; canvas.height = ATLAS_H;
	const ctx = canvas.getContext( '2d' );
	SIGNS.forEach( ( s, i ) => {
		const x = ( i % SIGN_COLS ) * SIGN_W, y = Math.floor( i / SIGN_COLS ) * SIGN_H;
		ctx.save();
		ctx.beginPath(); ctx.rect( x, y, SIGN_W, SIGN_H ); ctx.clip();
		drawSign( ctx, s, x, y, SIGN_W, SIGN_H, i );
		ctx.restore();
	} );
	return canvas;
}

function fitText( ctx, text, font, weight, maxW, maxH ) {
	let size = maxH;
	ctx.font = `${weight} ${size}px ${font}`;
	const w = ctx.measureText( text ).width;
	if ( w > maxW ) size = Math.floor( size * maxW / w );
	ctx.font = `${weight} ${size}px ${font}`;
	return size;
}

function drawSign( ctx, s, x, y, W, H, i ) {
	// the board face shows the central 7:1 of the 8:1 slot; keep the lettering inside it
	const safe = W * 0.8, cx = x + W / 2;
	const sub = s.sub;
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	const weather = ( ) => {
		// sun-bleached, grimy, a few scuffs: a week into the outbreak nobody cleans the signs
		const g = ctx.createLinearGradient( 0, y, 0, y + H );
		g.addColorStop( 0, 'rgba(255,255,255,0.06)' ); g.addColorStop( 0.6, 'rgba(0,0,0,0)' ); g.addColorStop( 1, 'rgba(40,30,20,0.18)' );
		ctx.fillStyle = g; ctx.fillRect( x, y, W, H );
		let seed = ( i * 2654435761 ) >>> 0;
		const rnd = () => ( ( seed = ( Math.imul( seed ^ ( seed >>> 15 ), 2246822507 ) + 0x6D2B79F5 ) >>> 0 ) / 4294967296 );
		for ( let k = 0; k < 18; k ++ ) {
			ctx.fillStyle = `rgba(${rnd() < 0.5 ? '40,32,24' : '255,255,255'},${0.03 + rnd() * 0.05})`;
			ctx.fillRect( x + rnd() * W, y + rnd() * H, 2 + rnd() * 30, 1 + rnd() * 3 );
		}
	};
	switch ( s.style ) {
		case 'band': {
			ctx.fillStyle = css( s.bg ); ctx.fillRect( x, y, W, H );
			ctx.fillStyle = css( s.accent ); ctx.fillRect( x, y + H * 0.8, W, H * 0.12 );
			ctx.fillStyle = css( s.fg );
			fitText( ctx, s.text.toUpperCase(), FONTS.sans, '900', safe, H * 0.56 );
			ctx.fillText( s.text.toUpperCase(), cx, y + H * 0.42 );
			break;
		}
		case 'box': {
			ctx.fillStyle = css( s.bg ); ctx.fillRect( x, y, W, H );
			const bw = H * 0.72;
			const size = fitText( ctx, s.text, FONTS.sans, '800', safe - bw - 14, sub ? H * 0.5 : H * 0.6 );
			const tw = ctx.measureText( s.text ).width;
			const x0 = cx - ( tw + bw + 12 ) / 2;
			// logo box with a cross / leaf / star mark
			ctx.fillStyle = css( s.accent ); ctx.fillRect( x0, y + H * 0.14, bw, bw );
			ctx.fillStyle = css( s.bg );
			const mx = x0 + bw / 2, my = y + H * 0.14 + bw / 2, a = bw * 0.14, b = bw * 0.36;
			ctx.fillRect( mx - a, my - b, a * 2, b * 2 ); ctx.fillRect( mx - b, my - a, b * 2, a * 2 );
			ctx.fillStyle = css( s.fg ); ctx.textAlign = 'left';
			ctx.fillText( s.text, x0 + bw + 12, y + ( sub ? H * 0.38 : H * 0.52 ) );
			if ( sub ) { ctx.font = `600 ${Math.round( H * 0.26 )}px ${FONTS.cond}`; ctx.fillText( sub.toUpperCase(), x0 + bw + 14, y + H * 0.78 ); }
			void size;
			break;
		}
		case 'serif': {
			ctx.fillStyle = css( s.bg ); ctx.fillRect( x, y, W, H );
			ctx.strokeStyle = css( s.fg, 0.75 ); ctx.lineWidth = 3;
			ctx.strokeRect( x + W * 0.1 + 4, y + 5, W * 0.8 - 8, H - 10 );
			ctx.fillStyle = css( s.fg );
			fitText( ctx, s.text, FONTS.serif, 'italic 700', safe - 30, H * 0.62 );
			ctx.fillText( s.text, cx, y + H * 0.54 );
			break;
		}
		case 'channel': {
			// individual letters on a dark fascia (towers, banks, supermarkets)
			ctx.fillStyle = css( darken( s.bg, 0.55 ) ); ctx.fillRect( x, y, W, H );
			ctx.fillStyle = css( [ 255, 255, 255 ], 0.05 ); ctx.fillRect( x, y, W, H * 0.12 );
			ctx.fillStyle = css( s.fg );
			fitText( ctx, s.text.toUpperCase(), FONTS.sans, '700', safe, H * 0.58 );
			ctx.fillText( s.text.toUpperCase(), cx, y + H * 0.54 );
			break;
		}
		default: {
			ctx.fillStyle = css( s.bg ); ctx.fillRect( x, y, W, H );
			ctx.fillStyle = css( s.fg );
			if ( sub ) {
				fitText( ctx, s.text.toUpperCase(), FONTS.sans, '900', safe, H * 0.5 );
				ctx.fillText( s.text.toUpperCase(), cx, y + H * 0.36 );
				ctx.font = `700 ${Math.round( H * 0.24 )}px ${FONTS.cond}`;
				ctx.fillText( sub.toUpperCase(), cx, y + H * 0.8 );
			} else {
				fitText( ctx, s.text.toUpperCase(), FONTS.sans, '900', safe, H * 0.6 );
				ctx.fillText( s.text.toUpperCase(), cx, y + H * 0.54 );
			}
		}
	}
	weather();
}
