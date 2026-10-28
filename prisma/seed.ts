import bcrypt from "bcryptjs";
import { OrderStatus, Prisma, PrismaClient, SalesChannel, SuggestionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be configured before seeding.");
if (process.env.NODE_ENV === "production") throw new Error("Demo seed data is disabled in production.");
const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
const ownerPassword = process.env.SEED_OWNER_PASSWORD;
if (!ownerEmail || !ownerPassword || ownerPassword.length < 12) {
  throw new Error("Set SEED_OWNER_EMAIL and a SEED_OWNER_PASSWORD of at least 12 characters before seeding.");
}
const seedOwnerEmail = ownerEmail;
const seedOwnerPassword = ownerPassword;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const store = await db.store.upsert({
    where: { id: "demo-store" },
    update: {
      name: "សោភា ស្ទូឌីយោ",
      phone: "+855 12 999 888",
      address: "ផ្ទះលេខ 28, ផ្លូវ 310, សង្កាត់បឹងកេងកង 1, ខណ្ឌបឹងកេងកង, រាជធានីភ្នំពេញ",
      bakongAccountId: "sophea_store@aba",
      bankName: "ABA Bank",
      bankAccountNumber: "001 234 567",
      bankAccountName: "SOPHEA STUDIO",
      exchangeRate: new Prisma.Decimal(4100),
    },
    create: {
      id: "demo-store",
      name: "សោភា ស្ទូឌីយោ",
      currency: "USD",
      timezone: "Asia/Phnom_Penh",
      phone: "+855 12 999 888",
      address: "ផ្ទះលេខ 28, ផ្លូវ 310, សង្កាត់បឹងកេងកង 1, ខណ្ឌបឹងកេងកង, រាជធានីភ្នំពេញ",
      bakongAccountId: "sophea_store@aba",
      bankName: "ABA Bank",
      bankAccountNumber: "001 234 567",
      bankAccountName: "SOPHEA STUDIO",
      exchangeRate: new Prisma.Decimal(4100),
    },
  });
  const passwordHash = await bcrypt.hash(seedOwnerPassword, 12);
  const user = await db.user.upsert({
    where: { email: seedOwnerEmail },
    update: { name: "ដារា សុផាល់", passwordHash },
    create: { name: "ដារា សុផាល់", email: seedOwnerEmail, passwordHash },
  });
  await db.storeMembership.upsert({
    where: { userId_storeId: { userId: user.id, storeId: store.id } },
    update: { role: "OWNER" },
    create: { userId: user.id, storeId: store.id, role: "OWNER" },
  });

  const catalog = [
    {
      sku: "DR-001",
      name: "រ៉ូបផ្កាកូរ៉េទាន់សម័យ",
      category: "រ៉ូប",
      price: "18.50",
      costPrice: "9.00",
      barcode: "8842001001",
      stock: 45,
      imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80",
      variants: ["ផ្កាឈូក · S", "ផ្កាឈូក · M", "ផ្កាឈូក · L"],
    },
    {
      sku: "DR-002",
      name: "រ៉ូបរាត្រីសមោលសាច់សូត្រ",
      category: "រ៉ូប",
      price: "28.00",
      costPrice: "14.50",
      barcode: "8842001002",
      stock: 30,
      imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=80",
      variants: ["ខ្មៅ · S", "ខ្មៅ · M", "ក្រហមស្រា · S", "ក្រហមស្រា · M"],
    },
    {
      sku: "TS-001",
      name: "អាវយឺតកមូល Oversize Premium",
      category: "អាវ",
      price: "9.50",
      costPrice: "4.50",
      barcode: "8842001003",
      stock: 60,
      imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
      variants: ["ស · M", "ស · L", "ខ្មៅ · M", "ខ្មៅ · L"],
    },
    {
      sku: "SH-001",
      name: "អាវសាច់ក្រណាត់ដៃវែងស្ទីលកូរ៉េ",
      category: "អាវ",
      price: "16.00",
      costPrice: "8.50",
      barcode: "8842001004",
      stock: 35,
      imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=80",
      variants: ["ស · M", "ស · L", "ខៀវខ្ចី · M", "ខៀវខ្ចី · L"],
    },
    {
      sku: "JK-001",
      name: "អាវ Blazer ម៉ូដបែបអភិជន",
      category: "អាវធំ & អាវរងា",
      price: "29.50",
      costPrice: "16.00",
      barcode: "8842001005",
      stock: 25,
      imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80",
      variants: ["ពណ៌កាហ្វេ · S", "ពណ៌កាហ្វេ · M", "ពណ៌ខ្មៅ · M", "ពណ៌ខ្មៅ · L"],
    },
    {
      sku: "JN-001",
      name: "ខោខូវប៊យជើងធំស្ទីលយុវវ័យ",
      category: "ខោ & សំពត់",
      price: "21.00",
      costPrice: "11.00",
      barcode: "8842001006",
      stock: 40,
      imageUrl: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=80",
      variants: ["ខៀវស្រាល · Size 26 (S)", "ខៀវស្រាល · Size 28 (M)", "ខៀវស្រាល · Size 30 (L)"],
    },
    {
      sku: "TR-001",
      name: "ខោជើងវែងក្រណាត់សាច់ត្រជាក់",
      category: "ខោ & សំពត់",
      price: "15.50",
      costPrice: "8.00",
      barcode: "8842001007",
      stock: 35,
      imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=600&q=80",
      variants: ["ខ្មៅ · S", "ខ្មៅ · M", "បន៍ត្នោត · M"],
    },
    {
      sku: "SK-001",
      name: "សំពត់ខ្លីផ្លីសេស្ទីលកូរ៉េ",
      category: "ខោ & សំពត់",
      price: "12.50",
      costPrice: "6.00",
      barcode: "8842001008",
      stock: 30,
      imageUrl: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=600&q=80",
      variants: ["ខ្មៅ · S", "ខ្មៅ · M", "ស · S", "ស · M"],
    },
    {
      sku: "ST-001",
      name: "ឈុតអាវកាក់និងខោជើងវែង ២ បំណែក",
      category: "ឈុតសម្លៀកបំពាក់",
      price: "32.00",
      costPrice: "17.50",
      barcode: "8842001009",
      stock: 20,
      imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80",
      variants: ["បន៍ត្នោតខ្ចី · S", "បន៍ត្នោតខ្ចី · M", "ខ្មៅ · M"],
    },
  ];
  const products = new Map<string, { id: string; price: Prisma.Decimal; costPrice: Prisma.Decimal; variants: { id: string; name: string }[] }>();
  for (const item of catalog) {
    const existing = await db.product.findFirst({ where: { storeId: store.id, sku: item.sku } });
    const product = existing
      ? await db.product.update({ where: { id: existing.id }, data: { name: item.name, category: item.category, price: new Prisma.Decimal(item.price), costPrice: new Prisma.Decimal(item.costPrice), barcode: item.barcode, stock: item.stock, imageUrl: item.imageUrl, active: true } })
      : await db.product.create({ data: { storeId: store.id, name: item.name, sku: item.sku, category: item.category, price: new Prisma.Decimal(item.price), costPrice: new Prisma.Decimal(item.costPrice), barcode: item.barcode, stock: item.stock, imageUrl: item.imageUrl } });
    for (const [index, name] of item.variants.entries()) {
      const variant = await db.productVariant.findFirst({ where: { productId: product.id, sku: `${item.sku}-${index + 1}` } });
      if (variant) await db.productVariant.update({ where: { id: variant.id }, data: { name, active: true, costPrice: new Prisma.Decimal(item.costPrice) } });
      else await db.productVariant.create({ data: { productId: product.id, name, sku: `${item.sku}-${index + 1}`, active: true, costPrice: new Prisma.Decimal(item.costPrice) } });
    }
    products.set(item.sku, {
      id: product.id,
      price: product.price,
      costPrice: new Prisma.Decimal(item.costPrice),
      variants: await db.productVariant.findMany({ where: { productId: product.id, active: true }, select: { id: true, name: true } }),
    });
  }

  const customerSeeds = [
    {
      name: "សុខា មាន",
      phone: "+855 12 345 678",
      channel: SalesChannel.FACEBOOK,
      email: "sokha@example.test",
      telegramUsername: "sokha_mean",
      address: {
        label: "ផ្ទះ (Home)",
        recipient: "សុខា មាន",
        phone: "012 345 678",
        province: "ភ្នំពេញ",
        district: "ខណ្ឌទួលគោក",
        commune: "សង្កាត់បឹងកក់២",
        address: "ផ្ទះលេខ 45A, ផ្លូវ 315, សង្កាត់បឹងកក់២, ខណ្ឌទួលគោក, រាជធានីភ្នំពេញ",
      },
    },
    {
      name: "បុប្ផា ចាន់",
      phone: "+855 98 888 777",
      channel: SalesChannel.TIKTOK,
      email: "bopha@example.test",
      telegramUsername: "bopha_siemreap",
      address: {
        label: "ហាង (Shop)",
        recipient: "បុប្ផា ចាន់",
        phone: "098 888 777",
        province: "សៀមរាប",
        district: "ក្រុងសៀមរាប",
        commune: "សង្កាត់ស្វាយដង្គំ",
        address: "ភូមិវត្តបូព៌, សង្កាត់ស្វាយដង្គំ, ក្រុងសៀមរាប, ខេត្តសៀមរាប",
      },
    },
    {
      name: "វិច្ឆិកា កែវ",
      phone: "+855 17 222 401",
      channel: SalesChannel.TELEGRAM,
      email: "",
      telegramUsername: "vicheka_keo",
      address: {
        label: "ផ្ទះ (Home)",
        recipient: "វិច្ឆិកា កែវ",
        phone: "017 222 401",
        province: "បាត់ដំបង",
        district: "ក្រុងបាត់ដំបង",
        commune: "សង្កាត់ស្វាយប៉ោ",
        address: "ផ្លូវលេខ 1, សង្កាត់ស្វាយប៉ោ, ក្រុងបាត់ដំបង, ខេត្តបាត់ដំបង",
      },
    },
    {
      name: "ពិសិដ្ឋ ឡុង",
      phone: "+855 77 321 810",
      channel: SalesChannel.FACEBOOK,
      email: "",
      telegramUsername: "piseth_long",
      address: {
        label: "កន្លែងធ្វើការ (Office)",
        recipient: "ពិសិដ្ឋ ឡុង",
        phone: "077 321 810",
        province: "ភ្នំពេញ",
        district: "ខណ្ឌចំការមន",
        commune: "សង្កាត់ទន្លេបាសាក់",
        address: "អគារកាណាឌីយ៉ា, ផ្លូវព្រះមុនីវង្ស, រាជធានីភ្នំពេញ",
      },
    },
    {
      name: "សុវណ្ណារ៉ា អែម",
      phone: "+855 96 555 180",
      channel: SalesChannel.TIKTOK,
      email: "sovannara@example.test",
      telegramUsername: "sovannara_official",
      address: {
        label: "ផ្ទះ (Home)",
        recipient: "សុវណ្ណារ៉ា អែម",
        phone: "096 555 180",
        province: "ព្រះសីហនុ",
        district: "ក្រុងព្រះសីហនុ",
        commune: "សង្កាត់លេខ៤",
        address: "ផ្លូវឯករាជ្យ, សង្កាត់លេខ៤, ក្រុងព្រះសីហនុ, ខេត្តព្រះសីហនុ",
      },
    },
  ];
  const customers = new Map<string, { id: string; name: string }>();
  for (const entry of customerSeeds) {
    const existing = await db.customer.findFirst({ where: { storeId: store.id, phone: entry.phone } });
    const customer = existing
      ? await db.customer.update({ where: { id: existing.id }, data: { name: entry.name, preferredChannel: entry.channel, email: entry.email || null, telegramUsername: entry.telegramUsername } })
      : await db.customer.create({ data: { storeId: store.id, name: entry.name, phone: entry.phone, email: entry.email || null, preferredChannel: entry.channel, telegramUsername: entry.telegramUsername } });
    customers.set(entry.name, customer);

    // Seed customer saved address
    const existingAddr = await db.customerAddress.findFirst({ where: { customerId: customer.id } });
    if (!existingAddr && entry.address) {
      await db.customerAddress.create({
        data: {
          customerId: customer.id,
          label: entry.address.label,
          recipient: entry.address.recipient,
          phone: entry.address.phone,
          province: entry.address.province,
          district: entry.address.district,
          commune: entry.address.commune,
          address: entry.address.address,
          isDefault: true,
        },
      });
    }
  }

  const orderFixtures = [
    {
      orderNumber: "SS-DEMO-8291",
      customer: "សុខា មាន",
      sku: "FS-001",
      variant: "មធ្យម (M)",
      status: OrderStatus.CONFIRMED,
      quantity: 1,
      courier: "VET",
      trackingNumber: "VET-883921",
      paymentMethod: "KHQR",
      paymentStatus: "PAID",
      province: "ភ្នំពេញ",
      deliveryFee: "1.25",
      deliveryAddress: "ផ្ទះលេខ 45A, ផ្លូវ 315, ទួលគោក, ភ្នំពេញ",
      daysAgo: 0,
    },
    {
      orderNumber: "SS-DEMO-8290",
      customer: "បុប្ផា ចាន់",
      sku: "AC-014",
      variant: "ក្រហម",
      status: OrderStatus.PENDING_CONFIRMATION,
      quantity: 1,
      courier: "JNT",
      trackingNumber: "JNT-992014",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      province: "សៀមរាប",
      deliveryFee: "2.00",
      deliveryAddress: "ភូមិវត្តបូព៌, ស្វាយដង្គំ, ក្រុងសៀមរាប",
      daysAgo: 1,
    },
    {
      orderNumber: "SS-DEMO-8289",
      customer: "វិច្ឆិកា កែវ",
      sku: "HM-003",
      variant: "ពណ៌ខៀវចាស់",
      status: OrderStatus.SHIPPED,
      quantity: 5,
      courier: "FLASH",
      trackingNumber: "FL-551920",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      province: "បាត់ដំបង",
      deliveryFee: "2.00",
      deliveryAddress: "ផ្លូវលេខ 1, ស្វាយប៉ោ, ក្រុងបាត់ដំបង",
      daysAgo: 2,
    },
    {
      orderNumber: "SS-DEMO-8288",
      customer: "សុខា មាន",
      sku: "SH-008",
      variant: "មធ្យម (M)",
      status: OrderStatus.DELIVERED,
      quantity: 2,
      courier: "GRAB",
      trackingNumber: "GRAB-EXP-104",
      paymentMethod: "KHQR",
      paymentStatus: "PAID",
      province: "ភ្នំពេញ",
      deliveryFee: "1.25",
      deliveryAddress: "ផ្ទះលេខ 45A, ផ្លូវ 315, ទួលគោក, ភ្នំពេញ",
      daysAgo: 4,
    },
    {
      orderNumber: "SS-DEMO-8287",
      customer: "ពិសិដ្ឋ ឡុង",
      sku: "TR-021",
      variant: "បន៍ត្នោតខ្ចី · មធ្យម",
      status: OrderStatus.PROCESSING,
      quantity: 1,
      courier: "KERRY",
      trackingNumber: "KE-331092",
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PAID",
      province: "ភ្នំពេញ",
      deliveryFee: "1.25",
      deliveryAddress: "អគារកាណាឌីយ៉ា, ផ្លូវព្រះមុនីវង្ស, ភ្នំពេញ",
      daysAgo: 7,
    },
    {
      orderNumber: "SS-DEMO-8286",
      customer: "បុប្ផា ចាន់",
      sku: "SH-008",
      variant: "តូច (S)",
      status: OrderStatus.CANCELLED,
      quantity: 1,
      courier: "VET",
      trackingNumber: "VET-771203",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      province: "សៀមរាប",
      deliveryFee: "2.00",
      deliveryAddress: "ភូមិវត្តបូព៌, ស្វាយដង្គំ, ក្រុងសៀមរាប",
      daysAgo: 9,
    },
  ];
  for (const fixture of orderFixtures) {
    const existing = await db.order.findUnique({ where: { storeId_orderNumber: { storeId: store.id, orderNumber: fixture.orderNumber } } });
    const product = products.get(fixture.sku);
    const selectedVariant = product?.variants.find((variant) => variant.name === fixture.variant);
    const price = new Prisma.Decimal(catalog.find((item) => item.sku === fixture.sku)!.price);
    const costPrice = product?.costPrice ?? new Prisma.Decimal(0);
    const lineTotal = price.mul(fixture.quantity);
    const deliveryFee = new Prisma.Decimal(fixture.deliveryFee);
    const total = lineTotal.add(deliveryFee);
    const createdAt = new Date(Date.now() - fixture.daysAgo * 86_400_000);
    if (existing) {
      await db.order.update({
        where: { id: existing.id },
        data: {
          courier: fixture.courier,
          trackingNumber: fixture.trackingNumber,
          paymentMethod: fixture.paymentMethod,
          paymentStatus: fixture.paymentStatus,
          province: fixture.province,
          deliveryAddress: fixture.deliveryAddress,
          deliveryFee,
          total,
        },
      });
      await db.orderItem.updateMany({
        where: { orderId: existing.id },
        data: {
          productName: catalog.find((item) => item.sku === fixture.sku)!.name,
          productSku: fixture.sku,
          variantName: fixture.variant,
          costPrice,
        },
      });
      continue;
    }
    const order = await db.order.create({
      data: {
        storeId: store.id,
        customerId: customers.get(fixture.customer)!.id,
        orderNumber: fixture.orderNumber,
        channel: customerSeeds.find((customer) => customer.name === fixture.customer)!.channel,
        status: fixture.status,
        subtotal: lineTotal,
        discount: new Prisma.Decimal(0),
        deliveryFee,
        total,
        courier: fixture.courier,
        trackingNumber: fixture.trackingNumber,
        paymentMethod: fixture.paymentMethod,
        paymentStatus: fixture.paymentStatus,
        province: fixture.province,
        deliveryAddress: fixture.deliveryAddress,
        exchangeRate: new Prisma.Decimal(4100),
        createdAt,
        items: { create: [{
          productId: product!.id,
          variantId: selectedVariant?.id,
          productName: catalog.find((item) => item.sku === fixture.sku)!.name,
          productSku: fixture.sku,
          variantName: fixture.variant,
          quantity: fixture.quantity,
          unitPrice: price,
          costPrice,
          lineTotal,
        }] },
        history: { create: { to: fixture.status, note: "Development sample order", createdAt } },
      },
    });
    await db.auditLog.create({ data: { storeId: store.id, action: "DEMO_ORDER_SEEDED", entity: "Order", entityId: order.id } });
  }

  const conversation = await db.conversation.upsert({
    where: { storeId_channel_externalId: { storeId: store.id, channel: SalesChannel.FACEBOOK, externalId: "demo-facebook-sokha" } },
    update: {},
    create: { storeId: store.id, customerId: customers.get("សុខា មាន")!.id, channel: SalesChannel.FACEBOOK, externalId: "demo-facebook-sokha" },
  });
  const conversationMessages = [
    { externalId: "demo-msg-1", senderName: "សុខា មាន", senderType: "CUSTOMER", body: "សួស្តី តើមានសំពត់ខ្មែរលំនាំផ្កាទំហំ M ទេ?", sentAt: new Date(Date.now() - 45 * 60_000) },
    { externalId: "demo-msg-2", senderName: "ដារា សុផាល់", senderType: "SELLER", body: "មានទំហំ M តម្លៃ $25.50។ តើអ្នកចង់ឱ្យខ្ញុំកក់មួយឱ្យទេ?", sentAt: new Date(Date.now() - 30 * 60_000) },
    { externalId: "demo-msg-3", senderName: "សុខា មាន", senderType: "CUSTOMER", body: "ខ្ញុំចង់បានមួយ។ តើអាចដឹកទៅទួលគោកបានទេ?", sentAt: new Date(Date.now() - 15 * 60_000) },
  ];
  const messageRows = [];
  for (const message of conversationMessages) {
    const row = await db.message.upsert({
      where: { conversationId_externalId: { conversationId: conversation.id, externalId: message.externalId } },
      update: { senderName: message.senderName, body: message.body },
      create: { conversationId: conversation.id, ...message },
    });
    messageRows.push(row);
  }
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: conversationMessages[2].sentAt } });
  const demoJob = await db.detectionJob.upsert({
    where: { id: "demo-suggestion-purchase-intent" },
    update: {},
    create: { id: "demo-suggestion-purchase-intent", storeId: store.id, conversationId: conversation.id, messageId: messageRows[2].id, status: "COMPLETED", provider: "demo-seed", model: "fixture", completedAt: new Date() },
  });
  const existingSuggestion = await db.orderSuggestion.findFirst({ where: { storeId: store.id, jobId: demoJob.id } });
  if (!existingSuggestion) {
    const product = products.get("FS-001")!;
    const variant = product.variants.find((item) => item.name === "មធ្យម (M)")!;
    await db.orderSuggestion.create({
      data: {
        storeId: store.id,
        conversationId: conversation.id,
        jobId: demoJob.id,
        status: SuggestionStatus.PENDING,
        intent: "PURCHASE_INTENT",
        confidence: 88,
        extracted: { items: [{ productId: product.id, variantId: variant.id, productName: "Floral Khmer Skirt", variantName: "Medium", quantity: 1 }], requiresSellerReview: true },
        missingInfo: ["អាសយដ្ឋានដឹកជញ្ជូន"],
        explanation: "អតិថិជនបានបង្ហាញបំណងចង់ទិញ និងសួរអំពីការដឹកជញ្ជូន។ ព័ត៌មានអាសយដ្ឋាន និងការបញ្ជាក់ចុងក្រោយនៅតែត្រូវការ។",
        provider: "demo-seed",
        model: "fixture",
        evidence: { create: [{ messageId: messageRows[2].id }] },
      },
    });
  } else {
    await db.orderSuggestion.update({
      where: { id: existingSuggestion.id },
      data: {
        missingInfo: ["អាសយដ្ឋានដឹកជញ្ជូន"],
        explanation: "អតិថិជនបានបង្ហាញបំណងចង់ទិញ និងសួរអំពីការដឹកជញ្ជូន។ ព័ត៌មានអាសយដ្ឋាន និងការបញ្ជាក់ចុងក្រោយនៅតែត្រូវការ។",
        extracted: { items: [{ productId: products.get("FS-001")!.id, variantId: products.get("FS-001")!.variants.find((item) => item.name === "មធ្យម (M)")!.id, productName: "សំពត់ខ្មែរលំនាំផ្កា", variantName: "មធ្យម (M)", quantity: 1 }], requiresSellerReview: true },
      },
    });
  }

  for (const channel of [SalesChannel.FACEBOOK, SalesChannel.TIKTOK, SalesChannel.TELEGRAM]) {
    await db.channelConnection.upsert({
      where: { storeId_channel: { storeId: store.id, channel } },
      update: { status: "NOT_CONNECTED" },
      create: { storeId: store.id, channel, status: "NOT_CONNECTED" },
    });
  }
  console.info(`Seed ready for ${seedOwnerEmail}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => { await db.$disconnect(); });
