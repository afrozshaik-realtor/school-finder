// Hand-written baseline types mirroring supabase/migrations/*.sql.
//
// TODO once a real hosted Supabase project exists: replace this file with
// a generated one via `npm run db:types` (wraps
// `supabase gen types typescript --project-id <ref>`), then re-apply any
// hand-written helper types below the generated block. Keeping this
// hand-written version in the meantime means the app is fully typed from
// day one instead of using `any` everywhere.

export type DesignationStatus = "designated" | "none_confirmed" | "unavailable";
export type SchoolType = "public" | "catholic" | "private" | "charter";
export type City = "Calgary" | "Airdrie" | "Chestermere" | "Cochrane";
export type BoundaryStatus = "draft" | "published" | "archived";
export type UserRole = "user" | "editor" | "admin";

// postgrest-js requires every Table/View to declare `Relationships` (even
// if empty) to satisfy its GenericSchema constraint -- omitting it causes
// the whole Database type to silently fail that constraint, which makes
// every .from()/.rpc() call fall back to `never`/`any` with no visible
// error until a consuming call site tries to use a field. These cover the
// foreign keys actually used by embedded selects (`schools(...)`,
// `school_authorities(...)`) in this codebase; add more here if a new
// embedded select is introduced.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string; full_name?: string | null; role?: UserRole };
        Update: { full_name?: string | null };
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: string;
          name: string;
          organization: string;
          source_url: string | null;
          license: string | null;
          license_url: string | null;
          coverage_description: string | null;
          authorization_notes: string | null;
          last_verified_at: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["data_sources"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["data_sources"]["Insert"]>;
        Relationships: [];
      };
      school_authorities: {
        Row: {
          id: string;
          name: string;
          authority_type: SchoolType;
          website: string | null;
          phone: string | null;
          source_id: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["school_authorities"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["school_authorities"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "school_authorities_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          id: string;
          authority_id: string;
          name: string;
          school_type: SchoolType;
          grade_min: string;
          grade_max: string;
          address: string;
          city: City;
          postal_code: string | null;
          phone: string | null;
          website: string | null;
          longitude: number | null;
          latitude: number | null;
          status: "active" | "closed" | "planned";
          source_id: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["schools"]["Row"],
          "id" | "created_at" | "updated_at" | "status" | "longitude" | "latitude"
        > & { id?: string; status?: "active" | "closed" | "planned" };
        Update: Partial<Database["public"]["Tables"]["schools"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "schools_authority_id_fkey";
            columns: ["authority_id"];
            isOneToOne: false;
            referencedRelation: "school_authorities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schools_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      school_programs: {
        Row: {
          id: string;
          school_id: string;
          program_name: string;
          program_code: string | null;
          grade_min: string | null;
          grade_max: string | null;
          notes: string | null;
          source_id: string | null;
          is_demo: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["school_programs"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["school_programs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "school_programs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_programs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      boundary_versions: {
        Row: {
          id: string;
          authority_id: string;
          school_year: string;
          program_scope: string | null;
          status: BoundaryStatus;
          is_current: boolean;
          coverage_complete: boolean;
          source_id: string | null;
          notes: string | null;
          is_demo: boolean;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["boundary_versions"]["Row"],
          "id" | "created_at" | "updated_at" | "published_at" | "published_by" | "status" | "is_current"
        > & { id?: string; status?: BoundaryStatus; is_current?: boolean };
        Update: Partial<Database["public"]["Tables"]["boundary_versions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "boundary_versions_authority_id_fkey";
            columns: ["authority_id"];
            isOneToOne: false;
            referencedRelation: "school_authorities";
            referencedColumns: ["id"];
          },
        ];
      };
      search_history: {
        Row: {
          id: string;
          user_id: string | null;
          address_text: string;
          searched_at: string;
          consent: boolean;
        };
        Insert: { user_id: string; address_text: string; consent: boolean };
        Update: Record<string, never>;
        Relationships: [];
      };
      gtfs_feeds: {
        Row: {
          id: string;
          name: string;
          agency_name: string;
          source_url: string | null;
          license: string | null;
          feed_version: string | null;
          service_start_date: string | null;
          service_end_date: string | null;
          last_imported_at: string | null;
          source_id: string | null;
          is_demo: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["gtfs_feeds"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["gtfs_feeds"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      official_schools: {
        Row: Database["public"]["Tables"]["schools"]["Row"];
        Relationships: Database["public"]["Tables"]["schools"]["Relationships"];
      };
      demo_schools: {
        Row: Database["public"]["Tables"]["schools"]["Row"];
        Relationships: Database["public"]["Tables"]["schools"]["Relationships"];
      };
      official_school_authorities: {
        Row: Database["public"]["Tables"]["school_authorities"]["Row"];
        Relationships: [];
      };
      demo_school_authorities: {
        Row: Database["public"]["Tables"]["school_authorities"]["Row"];
        Relationships: [];
      };
    };
    Functions: {
      find_designated_schools: {
        Args: {
          p_lon: number;
          p_lat: number;
          p_school_year: string;
          p_program_scope?: string | null;
          p_include_demo?: boolean;
        };
        Returns: {
          authority_id: string;
          school_id: string | null;
          status: DesignationStatus;
          boundary_version_id: string;
          source_id: string | null;
        }[];
      };
      nearby_stops: {
        Args: {
          p_lon: number;
          p_lat: number;
          p_radius_m?: number;
          p_include_demo?: boolean;
        };
        Returns: {
          feed_id: string;
          feed_name: string;
          stop_id: string;
          stop_name: string;
          distance_m: number;
          source_id: string | null;
        }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_editor_or_admin: { Args: Record<string, never>; Returns: boolean };
      publish_boundary_version: { Args: { version_id: string }; Returns: void };
      rollback_boundary_version: { Args: { version_id: string }; Returns: void };
      set_user_role: { Args: { target_user: string; new_role: UserRole }; Returns: void };
    };
  };
}
