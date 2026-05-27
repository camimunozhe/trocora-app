export type VerificationLevel = 'none' | 'basic' | 'intermediate' | 'advanced';
export type Currency = 'usd' | 'clp';
export type MeetupType = 'trade' | 'purchase' | 'casual';
export type MeetupStatus = 'pending' | 'countered' | 'confirmed' | 'completed' | 'cancelled';
export type CardCondition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played' | 'poor';
export type CardLanguage = 'en' | 'es' | 'jp' | 'pt' | 'fr' | 'de' | 'it' | 'ko' | 'other';
export type TCGGame = 'pokemon' | 'magic' | 'yugioh' | 'onepiece' | 'digimon' | 'lorcana' | 'other';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'username'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      cards_collection: {
        Row: CardCollection;
        Insert: Partial<CardCollection> & Pick<CardCollection, 'user_id' | 'game' | 'card_name'>;
        Update: Partial<Omit<CardCollection, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'cards_collection_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'collection_folders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_collection_magic_card_id_fkey';
            columns: ['magic_card_id'];
            isOneToOne: false;
            referencedRelation: 'magic_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_collection_pokemon_card_id_fkey';
            columns: ['pokemon_card_id'];
            isOneToOne: false;
            referencedRelation: 'pokemon_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_collection_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collection_folders: {
        Row: CollectionFolder;
        Insert: Partial<CollectionFolder> & Pick<CollectionFolder, 'user_id' | 'name'>;
        Update: Partial<Omit<CollectionFolder, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      meetups: {
        Row: Meetup;
        Insert: Partial<Meetup> & Pick<Meetup, 'proposer_id' | 'receiver_id' | 'type'>;
        Update: Partial<Omit<Meetup, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'meetups_last_modified_by_fkey';
            columns: ['last_modified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetups_proposer_id_fkey';
            columns: ['proposer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetups_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetups_safe_zone_id_fkey';
            columns: ['safe_zone_id'];
            isOneToOne: false;
            referencedRelation: 'safe_zones';
            referencedColumns: ['id'];
          },
        ];
      };
      safe_zones: {
        Row: SafeZone;
        Insert: Partial<SafeZone> & Pick<SafeZone, 'name' | 'address' | 'latitude' | 'longitude' | 'type' | 'country' | 'city'>;
        Update: Partial<Omit<SafeZone, 'id' | 'created_at'>>;
        Relationships: [];
      };
      meetup_cards: {
        Row: MeetupCard;
        Insert: Partial<MeetupCard> & Pick<MeetupCard, 'meetup_id' | 'card_id' | 'side'>;
        Update: Partial<Omit<MeetupCard, 'id' | 'created_at'>>;
        Relationships: [];
      };
      meetup_ratings: {
        Row: MeetupRating;
        Insert: Partial<MeetupRating> & Pick<MeetupRating, 'meetup_id' | 'rater_id' | 'rated_id' | 'rating'>;
        Update: Partial<Omit<MeetupRating, 'id' | 'created_at'>>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & Pick<Message, 'meetup_id' | 'sender_id' | 'body'>;
        Update: Partial<Omit<Message, 'id' | 'meetup_id' | 'sender_id' | 'created_at'>>;
        Relationships: [];
      };
      push_tokens: {
        Row: PushToken;
        Insert: Partial<PushToken> & Pick<PushToken, 'user_id' | 'token' | 'platform'>;
        Update: Partial<Omit<PushToken, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      magic_sets: {
        Row: MagicSet;
        Insert: Partial<MagicSet> & Pick<MagicSet, 'id' | 'name'>;
        Update: Partial<Omit<MagicSet, 'id' | 'created_at'>>;
        Relationships: [];
      };
      magic_cards: {
        Row: MagicCard;
        Insert: Partial<MagicCard> & Pick<MagicCard, 'id' | 'name' | 'set_name'>;
        Update: Partial<Omit<MagicCard, 'id' | 'created_at'>>;
        Relationships: [];
      };
      pokemon_sets: {
        Row: PokemonSet;
        Insert: Partial<PokemonSet> & Pick<PokemonSet, 'id' | 'name' | 'series' | 'total' | 'printed_total' | 'release_date'>;
        Update: Partial<Omit<PokemonSet, 'id' | 'created_at'>>;
        Relationships: [];
      };
      pokemon_cards: {
        Row: PokemonCard;
        Insert: Partial<PokemonCard> & Pick<PokemonCard, 'id' | 'name' | 'set_id' | 'set_name' | 'number'>;
        Update: Partial<Omit<PokemonCard, 'id' | 'created_at'>>;
        Relationships: [];
      };
      pokemon_card_price_history: {
        Row: PokemonCardPriceHistory;
        Insert: Partial<PokemonCardPriceHistory> & Pick<PokemonCardPriceHistory, 'card_id'>;
        Update: Partial<Omit<PokemonCardPriceHistory, 'id' | 'created_at'>>;
        Relationships: [];
      };
      card_watchlist: {
        Row: CardWatchlist;
        Insert: Partial<CardWatchlist> & Pick<CardWatchlist, 'user_id' | 'card_name'>;
        Update: Partial<Omit<CardWatchlist, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      user_reputation: {
        Row: {
          user_id: string | null;
          positive_count: number | null;
          negative_count: number | null;
          total_ratings: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      transfer_trade_cards: {
        Args: { p_meetup_id: string };
        Returns: undefined;
      };
      batch_update_pokemon_prices: {
        Args: { updates: Json };
        Returns: undefined;
      };
      get_inbox_count: {
        Args: { p_user_id: string };
        Returns: number;
      };
      get_my_meetup_unread_counts: {
        Args: { p_user_id: string };
        Returns: { meetup_id: string; unread_count: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = {
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

export type CardCollection = {
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

export type MagicSet = {
  id: string;
  name: string;
  set_type: string | null;
  released_at: string | null;
  card_count: number | null;
  icon_svg_uri: string | null;
  created_at: string;
}

export type MagicCard = {
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

export type CollectionFolder = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type Meetup = {
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
  proposer_last_read_at: string | null;
  receiver_last_read_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MeetupCard = {
  id: string;
  meetup_id: string;
  card_id: string;
  side: 'proposer' | 'receiver';
  created_at: string;
}

export type SafeZone = {
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

export type MeetupRating = {
  id: string;
  meetup_id: string;
  rater_id: string;
  rated_id: string;
  rating: 'positive' | 'negative';
  comment: string | null;
  created_at: string;
}

export type Message = {
  id: string;
  meetup_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
}

export type PokemonSet = {
  id: string;
  name: string;
  series: string;
  total: number;
  printed_total: number;
  release_date: string;
  logo_url: string | null;
  symbol_url: string | null;
  created_at: string | null;
}

export type PokemonCard = {
  id: string;
  name: string;
  set_id: string;
  set_name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  image_url: string | null;
  image_url_large: string | null;
  tcgplayer_normal_market: number | null;
  tcgplayer_normal_low: number | null;
  tcgplayer_foil_market: number | null;
  tcgplayer_foil_low: number | null;
  price_updated_at: string | null;
  created_at: string;
}

export type PokemonCardPriceHistory = {
  id: number;
  card_id: string;
  date: string;
  normal_market: number | null;
  normal_low: number | null;
  foil_market: number | null;
  foil_low: number | null;
  created_at: string;
}

export type CardWatchlist = {
  id: string;
  user_id: string;
  pokemon_card_id: string | null;
  magic_card_id: string | null;
  card_name: string;
  set_name: string | null;
  image_url: string | null;
  foil_only: boolean;
  conditions: CardCondition[];
  match_only_my_regions: boolean;
  created_at: string;
}
