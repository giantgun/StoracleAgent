export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          business_email: string | null;
          agent_inbox_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          business_email?: string | null;
          agent_inbox_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          business_email?: string | null;
          agent_inbox_id?: string | null;
          created_at?: string | null;
        };
      };
      wallets: {
        Row: {
          id: string;
          organization_id: string | null;
          crypto_network: string | null;
          public_session_key_address: string | null;
          non_custodial_wallet_address: string | null;
          cex_wallet_address: string | null;
          busha_id: string | null;
          fiat_currency: string | null;
          fiat_balance: number | null;
          usdt_balance: number | null;
          xaut_balance: number | null;
          encrypted_session_key: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          crypto_network?: string | null;
          public_session_key_address?: string | null;
          non_custodial_wallet_address?: string | null;
          cex_wallet_address?: string | null;
          busha_id?: string | null;
          fiat_currency?: string | null;
          fiat_balance?: number | null;
          usdt_balance?: number | null;
          xaut_balance?: number | null;
          encrypted_session_key?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          crypto_network?: string | null;
          public_session_key_address?: string | null;
          non_custodial_wallet_address?: string | null;
          cex_wallet_address?: string | null;
          busha_id?: string | null;
          fiat_currency?: string | null;
          fiat_balance?: number | null;
          usdt_balance?: number | null;
          xaut_balance?: number | null;
          encrypted_session_key?: string | null;
          created_at?: string | null;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          unit_name: string | null;
          unit_sales_price_in_usdt: number | null;
          expected_purchase_price_in_usdt: number | null;
          quantity: number;
          in_transit_quantity: number;
          inventory_capacity: number;
          critical_order_level: number;
          minimum_bulk_quantity: number;
          supplier_lead_time_days: number;
          supplier_id: string | null;
          last_restocked_at: string | null;
          last_consumption_check_at: string | null;
          is_agent_active: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          unit_name?: string | null;
          unit_sales_price_in_usdt?: number | null;
          expected_purchase_price_in_usdt?: number | null;
          quantity?: number;
          in_transit_quantity?: number;
          inventory_capacity?: number;
          critical_order_level?: number;
          minimum_bulk_quantity?: number;
          supplier_lead_time_days?: number;
          supplier_id?: string | null;
          last_restocked_at?: string | null;
          last_consumption_check_at?: string | null;
          is_agent_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          name?: string;
          unit_name?: string | null;
          unit_sales_price_in_usdt?: number | null;
          expected_purchase_price_in_usdt?: number | null;
          quantity?: number;
          in_transit_quantity?: number;
          inventory_capacity?: number;
          critical_order_level?: number;
          minimum_bulk_quantity?: number;
          supplier_lead_time_days?: number;
          supplier_id?: string | null;
          last_restocked_at?: string | null;
          last_consumption_check_at?: string | null;
          is_agent_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string | null;
          inventory_item_id: string | null;
          name: string | null;
          email: string | null;
          non_custodial_wallet_address: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          inventory_item_id?: string | null;
          name?: string | null;
          email?: string | null;
          non_custodial_wallet_address?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          inventory_item_id?: string | null;
          name?: string | null;
          email?: string | null;
          non_custodial_wallet_address?: string | null;
          created_at?: string | null;
        };
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string | null;
          supplier_id: string | null;
          status: string | null;
          total_amount: number | null;
          currency: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          supplier_id?: string | null;
          status?: string | null;
          total_amount?: number | null;
          currency?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          supplier_id?: string | null;
          status?: string | null;
          total_amount?: number | null;
          currency?: string | null;
          created_at?: string | null;
        };
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string | null;
          inventory_item_id: string | null;
          quantity: number | null;
          price: number | null;
        };
        Insert: {
          id?: string;
          purchase_order_id?: string | null;
          inventory_item_id?: string | null;
          quantity?: number | null;
          price?: number | null;
        };
        Update: {
          id?: string;
          purchase_order_id?: string | null;
          inventory_item_id?: string | null;
          quantity?: number | null;
          price?: number | null;
        };
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string | null;
          supplier_id: string | null;
          invoice_number: string | null;
          total_amount: number | null;
          due_date: string | null;
          invoice_url: string | null;
          currency: string | null;
          url: string | null;
          received_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          supplier_id?: string | null;
          invoice_number?: string | null;
          total_amount?: number | null;
          due_date?: string | null;
          invoice_url?: string | null;
          currency?: string | null;
          url?: string | null;
          received_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          supplier_id?: string | null;
          invoice_number?: string | null;
          total_amount?: number | null;
          due_date?: string | null;
          invoice_url?: string | null;
          currency?: string | null;
          url?: string | null;
          received_at?: string | null;
        };
      };
      crypto_transactions: {
        Row: {
          id: string;
          organization_id: string | null;
          wallet_id: string | null;
          type: string | null;
          status: string | null;
          amount: number | null;
          currency: string | null;
          destination_address: string | null;
          blockchain_tx_hash: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          wallet_id?: string | null;
          type?: string | null;
          status?: string | null;
          amount?: number | null;
          currency?: string | null;
          destination_address?: string | null;
          blockchain_tx_hash?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          wallet_id?: string | null;
          type?: string | null;
          status?: string | null;
          amount?: number | null;
          currency?: string | null;
          destination_address?: string | null;
          blockchain_tx_hash?: string | null;
          created_at?: string | null;
        };
      };
      email_inbox: {
        Row: {
          id: string;
          organization_id: string | null;
          agent_inbox_id: string | null;
          sender: string | null;
          subject: string | null;
          body: string | null;
          attachments: string[] | null;
          processed: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          agent_inbox_id?: string | null;
          sender?: string | null;
          subject?: string | null;
          body?: string | null;
          attachments?: string[] | null;
          processed?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          agent_inbox_id?: string | null;
          sender?: string | null;
          subject?: string | null;
          body?: string | null;
          attachments?: string[] | null;
          processed?: boolean | null;
          created_at?: string | null;
        };
      };
      agent_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          agent_name: string | null;
          event_type: string | null;
          message: string | null;
          metadata: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          agent_name?: string | null;
          event_type?: string | null;
          message?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          agent_name?: string | null;
          event_type?: string | null;
          message?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
      };
      agent_tasks: {
        Row: {
          id: string;
          organization_id: string | null;
          agent_name: string | null;
          task_type: string | null;
          status: string | null;
          priority: number | null;
          payload: Json | null;
          result: Json | null;
          is_routine_task: boolean | null;
          scheduled_for: string | null;
          created_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          agent_name?: string | null;
          task_type?: string | null;
          status?: string | null;
          priority?: number | null;
          payload?: Json | null;
          result?: Json | null;
          is_routine_task?: boolean | null;
          scheduled_for?: string | null;
          created_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          agent_name?: string | null;
          task_type?: string | null;
          status?: string | null;
          priority?: number | null;
          payload?: Json | null;
          result?: Json | null;
          is_routine_task?: boolean | null;
          scheduled_for?: string | null;
          created_at?: string | null;
          completed_at?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string | null;
          title: string | null;
          message: string | null;
          type: string | null;
          read: boolean | null;
          metadata: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          title?: string | null;
          message?: string | null;
          type?: string | null;
          read?: boolean | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          title?: string | null;
          message?: string | null;
          type?: string | null;
          read?: boolean | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
      };
      currency_prices: {
        Row: {
          id: string;
          currency: string;
          price_in_usdt: number;
          high_in_usdt: number | null;
          low_in_usdt: number | null;
          recorded_at: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          currency: string;
          price_in_usdt: number;
          high_in_usdt?: number | null;
          low_in_usdt?: number | null;
          recorded_at?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          currency?: string;
          price_in_usdt?: number;
          high_in_usdt?: number | null;
          low_in_usdt?: number | null;
          recorded_at?: string;
          created_at?: string | null;
        };
      };
    };
    Functions: {
      claim_next_task: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["agent_tasks"]["Row"][];
      };
      confirm_inventory_fulfillment: {
        Args: {
          p_event_id: string;
          p_item_id: string;
          p_quantity: number;
        };
        Returns: undefined;
      };
      record_supplier_payment: {
        Args: {
          p_organization_id: string;
          p_inventory_item_id: string;
          p_quantity: number;
          p_amount: number;
          p_tx_hash: string;
          p_supplier_id?: number | null;
          p_invoice_id?: number | null;
        };
        Returns: undefined;
      };
    };
  };
}
