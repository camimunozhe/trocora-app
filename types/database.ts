export type VerificationLevel = 'none' | 'basic' | 'intermediate' | 'advanced';
export type Currency = 'usd' | 'clp';
export type MeetupType = 'trade' | 'purchase' | 'casual';
export type MeetupStatus = 'pending' | 'countered' | 'confirmed' | 'completed' | 'cancelled';
export type CardCondition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played' | 'poor';
export type CardLanguage = 'en' | 'es' | 'jp' | 'pt' | 'fr' | 'de' | 'it' | 'ko' | 'other';
export type TCGGame = 'pokemon' | 'magic' | 'yugioh' | 'onepiece' | 'digimon' | 'lorcana' | 'other';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      cards_collection: {
        Row: CardCollection;
        Insert: Omit<CardCollection, 'id' | 'created_at'>;
        Update: Partial<Omit<CardCollection, 'id' | 'user_id' | 'created_at'>>;
      };
      collection_folders: {
        Row: CollectionFolder;
        Insert: Omit<CollectionFolder, 'id' | 'created_at'>;
        Update: Partial<Omit<CollectionFolder, 'id' | 'user_id' | 'created_at'>>;
      };
      meetups: {
        Row: Meetup;
        Insert: Omit<Meetup, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Meetup, 'id' | 'created_at'>>;
      };
      safe_zones: {
        Row: SafeZone;
        Insert: Omit<SafeZone, 'id' | 'created_at'>;
        Update: Partial<Omit<SafeZone, 'id' | 'created_at'>>;
      };
      meetup_cards: {
        Row: MeetupCard;
        Insert: Omit<MeetupCard, 'id' | 'created_at'>;
        Update: Partial<Omit<MeetupCard, 'id' | 'created_at'>>;
      };
      meetup_ratings: {
        Row: MeetupRating;
        Insert: Omit<MeetupRating, 'id' | 'created_at'>;
        Update: Partial<Omit<MeetupRating, 'id' | 'created_at'>>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at'>;
        Update: Partial<Omit<Message, 'id' | 'meetup_id' | 'sender_id' | 'created_at'>>;
      };
      push_tokens: {
        Row: PushToken;
        Insert: Omit<PushToken, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PushToken, 'id' | 'user_id' | 'created_at'>>;
      };
      magic_sets: {
        Row: MagicSet;
        Insert: Omit<MagicSet, 'created_at'>;
        Update: Partial<Omit<MagicSet, 'id' | 'created_at'>>;
      };
      magic_cards: {
        Row: MagicCard;
        Insert: Omit<MagicCard, 'created_at'>;
        Update: Partial<Omit<MagicCard, 'id' | 'created_at'>>;
      };
    };
  };
}

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  verification_level: VerificationLevel;
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  collection_public: boolean;
  currency: Currency;
  enabled_games: TCGGame[];
  regions: string[];
  onboarding_completed: boolean;
  emergency_contacts: string[] | null;
  premium_status: 'free' | 'active' | 'in_grace' | 'expired';
  premium_until: string | null;
  premium_product_id: string | null;
  premium_platform: string | null;
  theme_preference: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export interface CardCollection {
  id: string;
  user_id: string;
  game: TCGGame;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  quantity: number;
  condition: CardCondition;
  is_foil: boolean;
  is_for_trade: boolean;
  is_for_sale: boolean;
  is_published: boolean;
  is_boosted: boolean;
  custom_photos: string[];
  price_reference: number | null;
  price_reference_currency: Currency;
  notes: string | null;
  image_url: string | null;
  language: CardLanguage | null;
  folder_id: string | null;
  pokemon_card_id: string | null;
  magic_card_id: string | null;
  created_at: string;
}

export interface MagicSet {
  id: string;
  name: string;
  set_type: string | null;
  released_at: string | null;
  card_count: number | null;
  icon_svg_uri: string | null;
  created_at: string;
}

export interface MagicCard {
  id: string;
  name: string;
  set_id: string | null;
  set_name: string;
  collector_number: string | null;
  rarity: string | null;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  image_url: string | null;
  image_url_large: string | null;
  tcgplayer_normal_market: number | null;
  tcgplayer_foil_market: number | null;
  price_updated_at: string | null;
  created_at: string;
}

export interface CollectionFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Meetup {
  id: string;
  proposer_id: string;
  receiver_id: string;
  type: MeetupType;
  status: MeetupStatus;
  safe_zone_id: string | null;
  custom_location: string | null;
  scheduled_at: string | null;
  notes: string | null;
  agreed_price: number | null;
  agreed_price_currency: Currency;
  agreed_price_payer: 'proposer' | 'receiver' | null;
  counter_notes: string | null;
  last_modified_by: string | null;
  proposer_checked_in: boolean;
  receiver_checked_in: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetupCard {
  id: string;
  meetup_id: string;
  card_id: string;
  side: 'proposer' | 'receiver';
  created_at: string;
}

export interface SafeZone {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'tcg_store' | 'mall' | 'police_station' | 'public_space';
  country: string;
  city: string;
  verified: boolean;
  created_at: string;
}

export interface MeetupRating {
  id: string;
  meetup_id: string;
  rater_id: string;
  rated_id: string;
  rating: 'positive' | 'negative';
  comment: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  meetup_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
}
