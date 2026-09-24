const SUPABASE_URL = 'https://lqnrcrdeuuijryzaqksj.supabase.co';
const SUPABASE_FUNCTION =
  SUPABASE_URL + '/functions/v1/hyper-processor';

const PUBLISHABLE_KEY =
  'sb_publishable_qx_OYSKV4x2B3eIaftCQZQ_hpTnz4r2';

const API = SUPABASE_FUNCTION;

let state = {
  settings: {},
  products: []
};

let selected = null;

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));

async function apiFetch(path, options = {}) {
  const headers = {
    apikey: PUBLISHABLE_KEY,
    ...options.headers
  };

  const r = await fetch(API + path, {
    ...options,
    headers
  });

  const text = await r.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      error: text
    };
  }

  if (!r.ok) {
    throw new Error(
      data.error || 'تعذر الاتصال بالخادم'
    );
  }

  return data;
}

async function loadStore() {
  try {
    state = await apiFetch('/store');
    render();
  } catch (e) {
    console.error(e);

    $('products').innerHTML =
      '<div class="empty">تعذر الاتصال بالخادم. تأكد من إعداد Supabase.</div>';
  }
}

function render() {
  const s = state.settings || {};

  $('storeName').textContent =
    s.name || 'MXSN Nexus';

  $('storeTag').textContent =
    s.tag || 'متجر المنتجات الرقمية';

  $('storeTitle').textContent =
    s.name || 'MXSN Nexus';

  $('storeDescription').textContent =
    s.description || '';

  $('year').textContent =
    new Date().getFullYear();

  const q =
    $('search').value
      .toLowerCase()
      .trim();

  const ps =
    (state.products || []).filter(p =>
      `${p.name || ''} ${p.description || ''}`
        .toLowerCase()
        .includes(q)
    );

  $('count').textContent =
    ps.length + ' منتج';

  $('products').innerHTML =
    ps.map(p => `
      <article class="card">

        ${
          p.imageUrl
            ? `<img src="${esc(p.imageUrl)}" alt="">`
            : '<div class="placeholder">MXSN</div>'
        }

        <div class="card-body">

          <h3>${esc(p.name)}</h3>

          <p>${esc(p.description)}</p>

          <strong>
            ${esc(p.price)}
            ${esc(
              p.currency ||
              s.currency ||
              'USD'
            )}
          </strong>

          <button
            class="primary"
            onclick="openBuy('${p.id}')">
            شراء
          </button>

          <button
            class="secondary"
            onclick="shareProduct('${p.id}')">
            مشاركة
          </button>

        </div>
      </article>
    `).join('') ||
    '<div class="empty">لا توجد منتجات.</div>';
}

function openBuy(id) {
  selected =
    state.products.find(
      p => p.id === id
    );

  if (!selected) return;

  $('buyProduct').innerHTML = `
    <h3>${esc(selected.name)}</h3>

    <p>
      ${esc(selected.price)}
      ${esc(
        selected.currency ||
        state.settings.currency ||
        'USD'
      )}
    </p>
  `;

  $('paymentInfo').textContent = [
    state.settings.paymentProvider,
    state.settings.paymentAccount,
    state.settings.paymentInstructions
  ]
    .filter(Boolean)
    .join(' — ');

  $('amount').value =
    selected.price;

  $('transferId').value = '';

  $('customerName').value = '';

  $('customerContact').value = '';

  $('buyMsg').textContent = '';

  $('buyModal')
    .classList
    .remove('hidden');
}

function closeBuy() {
  $('buyModal')
    .classList
    .add('hidden');
}

function openTrack() {
  $('trackModal')
    .classList
    .remove('hidden');
}

function closeTrack() {
  $('trackModal')
    .classList
    .add('hidden');
}

async function submitOrder() {
  if (!selected) return;

  const customerName =
    $('customerName')
      .value
      .trim();

  const customerContact =
    $('customerContact')
      .value
      .trim();

  const transferId =
    $('transferId')
      .value
      .trim();

  const amount =
    Number(
      $('amount').value
    );

  if (!transferId || !amount) {
    $('buyMsg').textContent =
      'أدخل رقم التحويل والمبلغ.';
    return;
  }

  try {
    const d =
      await apiFetch(
        '/orders',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            product_id:
              selected.id,

            customer_email:
              customerContact,

            customer_name:
              customerName,

            amount:
              amount,

            currency:
              selected.currency ||
              state.settings.currency ||
              'USD'
          })
        }
      );

    const order =
      d.order || {};

    $('buyMsg').innerHTML = `
      تم إرسال الطلب بنجاح.<br>

      رقم الطلب:
      <b>
        ${esc(
          order.id ||
          'تم إنشاء الطلب'
        )}
      </b>

      <br>

      احتفظ به لمتابعة حالة الطلب.
    `;

  } catch (e) {
    console.error(e);

    $('buyMsg').textContent =
      e.message;
  }
}

async function trackOrder() {
  const id =
    $('orderIdInput')
      .value
      .trim();

  if (!id) return;

  $('trackMsg').textContent =
    'جاري البحث...';

  try {
    const d =
      await apiFetch(
        '/orders/' +
        encodeURIComponent(id)
      );

    const order =
      d.order || {};

    const labels = {
      pending:
        'بانتظار مراجعة الدفع',

      payment_submitted:
        'بانتظار مراجعة الدفع',

      paid:
        'تم البيع — المنتج جاهز',

      rejected:
        'تم رفض الطلب',

      refunded:
        'تم الاسترداد'
    };

    const productName =
      order.product_name ||
      order.productName ||
      '';

    const deliveryUrl =
      order.delivery_url ||
      order.deliveryUrl;

    $('trackMsg').innerHTML = `
      المنتج:
      ${esc(productName)}

      <br>

      الحالة:
      <b>
        ${esc(
          labels[order.status] ||
          order.status ||
          ''
        )}
      </b>

      ${
        deliveryUrl
          ? `
            <br>
            <a
              class="ok"
              href="${esc(deliveryUrl)}">
              تحميل المنتج
            </a>
          `
          : ''
      }
    `;

  } catch (e) {
    console.error(e);

    $('trackMsg').textContent =
      e.message;
  }
}

async function shareProduct(id) {
  const p =
    state.products.find(
      x => x.id === id
    );

  if (!p) return;

  const data = {
    title: p.name,

    text:
      p.description,

    url:
      location.origin +
      '/#product-' +
      p.id
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(
        data.url
      );
    }

    alert(
      'تم تجهيز رابط المشاركة.'
    );

  } catch {}
}

$('search').oninput = render;

loadStore();
