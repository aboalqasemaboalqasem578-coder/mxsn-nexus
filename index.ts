import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("adminPass")!;

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

console.log("MXSN Nexus Processor started");

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // ==============================
    // حالة الدالة
    // ==============================

    if (req.method === "GET" && path.endsWith("/hyper-processor")) {
      return response({
        success: true,
        service: "MXSN Nexus Processor",
        status: "online",
      });
    }

    // ==============================
    // جلب المتجر والمنتجات
    // ==============================

    if (req.method === "GET" && path.endsWith("/store")) {
      const { data: settings, error: settingsError } =
        await supabase
          .from("settings")
          .select("*")
          .limit(1);

      if (settingsError) {
        return response(
          {
            success: false,
            error: settingsError.message,
          },
          500
        );
      }

      const { data: products, error: productsError } =
        await supabase
          .from("products")
          .select("*")
          .order("created_at", {
            ascending: false,
          });

      if (productsError) {
        return response(
          {
            success: false,
            error: productsError.message,
          },
          500
        );
      }

      return response({
        success: true,
        settings: settings?.[0] ?? {},
        products: products ?? [],
      });
    }

    // ==============================
    // إنشاء طلب جديد
    // ==============================

    if (req.method === "POST" && path.endsWith("/orders")) {
      const body = await req.json();

      const {
        product_id,
        customer_email,
        customer_name,
        amount,
        currency,
      } = body;

      if (!product_id) {
        return response(
          {
            success: false,
            error: "product_id is required",
          },
          400
        );
      }

      if (!customer_email) {
        return response(
          {
            success: false,
            error: "customer_email is required",
          },
          400
        );
      }

      const { data: product, error: productError } =
        await supabase
          .from("products")
          .select("*")
          .eq("id", product_id)
          .single();

      if (productError || !product) {
        return response(
          {
            success: false,
            error: "Product not found",
          },
          404
        );
      }

      const { data: order, error: orderError } =
        await supabase
          .from("orders")
          .insert({
            product_id: product_id,
            customer_email: customer_email,
            customer_name: customer_name ?? null,
            amount: amount ?? product.price ?? 0,
            currency: currency ?? "USD",
            status: "pending",
            delivery_url:
              product.delivery_url ?? null,
          })
          .select("*")
          .single();

      if (orderError) {
        return response(
          {
            success: false,
            error: orderError.message,
          },
          500
        );
      }

      return response(
        {
          success: true,
          order: order,
        },
        201
      );
    }

    // ==============================
    // جلب طلب بواسطة ID
    // ==============================

    if (
      req.method === "GET" &&
      path.includes("/orders/")
    ) {
      const parts = path.split("/");
      const orderId = parts[parts.length - 1];

      if (!orderId) {
        return response(
          {
            success: false,
            error: "Order ID is required",
          },
          400
        );
      }

      const { data: order, error } =
        await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();

      if (error || !order) {
        return response(
          {
            success: false,
            error: "Order not found",
          },
          404
        );
      }

      return response({
        success: true,
        order: order,
      });
    }

    // ==============================
    // مسار غير موجود
    // ==============================

    return response(
      {
        success: false,
        error: "Route not found",
        path: path,
      },
      404
    );

  } catch (error) {
    console.error(error);

    return response(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});