import "dotenv/config";
import { db } from "../src/lib/db";

const catalog = [
  ["integrated-henna", "خلطة الحناء المتكاملة",500,7500,"henna"],
  ["sidr-mask", "ماسك السدر",200,11000,"sidr"],
  ["red-mashat-mask", "ماسك المشاط الأحمر",500,11000,"mashat"],
  ["green-mashat-mask", "ماسك المشاط الأخضر",500,13000,"mashat"],
  ["ground-henna", "الحناء المطحونة",200,4000,"henna"],
  ["sidr-powder", "بودرة السدر",100,5500,"sidr"],
  ["red-mashat-powder", "بودرة المشاط الأحمر",200,5000,"mashat"],
  ["green-mashat-powder", "بودرة المشاط الأخضر",200,6000,"mashat"],
  ["dark-color-powder", "بودرة اللون الداكن بعد الحناء",100,6000,"other"],
] as const;

async function main() {
  for (const [position,[slug,name]] of [["henna","الحناء"],["sidr","السدر"],["mashat","المشاط"],["other","منتجات أخرى معتمدة"]].entries())
    await db.category.upsert({where:{slug},create:{id:`category-${slug}`,slug,name,position},update:{}});
  for (const [slug,name,weightGrams,priceAgorot,category] of catalog) {
    const categoryRecord = await db.category.findUniqueOrThrow({where:{slug:category}});
    await db.product.upsert({where:{slug},create:{id:`product-${slug}`,slug,name,weightGrams,priceAgorot,categoryId:categoryRecord.id,status:"DRAFT",nameNeedsConfirmation:true,available:true,featured:false},update:{}});
  }
  const zoneData = [
    {id:"zone-west-bank",code:"west-bank",name:"الضفة الغربية",feeAgorot:2000,approved:true},
    {id:"zone-interior",code:"interior",name:"الداخل الفلسطيني",feeAgorot:3000,approved:true},
    {id:"zone-jerusalem",code:"jerusalem",name:"القدس — بحاجة لتأكيد التوصيل",feeAgorot:null,approved:false},
  ];
  for (const zone of zoneData) await db.deliveryZone.upsert({where:{code:zone.code},create:zone,update:{}});
  const cities:Record<string,string[]> = {
    "west-bank":["رام الله","البيرة","نابلس","جنين","طولكرم","قلقيلية","سلفيت","طوباس","أريحا","بيت لحم","الخليل"],
    interior:["الناصرة","أم الفحم","سخنين","شفا عمرو","حيفا","عكا","الطيبة","الطيرة","طمرة","رهط","باقة الغربية","يافا","اللد","الرملة"],
    jerusalem:["القدس"],
  };
  for (const [code,names] of Object.entries(cities)) {
    const zone = await db.deliveryZone.findUniqueOrThrow({where:{code}});
    for (const name of names) await db.city.upsert({where:{zoneId_name:{zoneId:zone.id,name}},create:{zoneId:zone.id,name},update:{}});
  }
  const settings = {
    store:{name:"ركن الحناء",englishName:"Rokn Alhenna",instagram:"https://www.instagram.com/rokn_alhenna/",whatsapp:"https://wa.me/970599373380",facebook:null,logoUrl:"/brand/rokn-alhenna-logo-transparent.webp",logoOriginalKey:"brand-assets/originals/Rukn_Al_Henna_Logo_4K.png"},
    checkoutEnabled:false,
    returns:{approved:false,body:"لا يقدّم ركن الحناء تبديلًا أو استرجاعًا اختياريًا للمنتجات. لا تستبعد هذه السياسة أي حقوق قانونية إلزامية لا يجوز التنازل عنها، بما في ذلك التعامل مع المنتج التالف أو الخاطئ أو غير المطابق للطلب بحسب القانون الواجب التطبيق. يرجى التواصل عبر واتساب عند وجود مشكلة في الطلب. هذه المسودة بحاجة إلى مراجعة واعتماد صاحب المتجر قبل الإطلاق."},
    privacy:{approved:false,body:"نستخدم الاسم ورقم الهاتف وعنوان التوصيل وبيانات الطلب لاستقبال الطلب وتجهيزه والتواصل بشأنه وتسليمه. لا يُتاح الوصول إليها إلا للإدارة المصرّح لها ومزوّدي الخدمة اللازمين لتنفيذ الطلب وفق الترتيبات المعتمدة. لا تُفعّل أدوات التحليل أو التتبع قبل ضبطها والحصول على الموافقات اللازمة. تُستكمل تفاصيل مزوّدي الاستضافة والتخزين ومدد الاحتفاظ وحقوق صاحب البيانات بعد اعتماد بيئة التشغيل والسياسة."},
    terms:{approved:false,body:"العملة المعتمدة هي الشيكل (ILS). طريقة الدفع الحالية هي الدفع عند الاستلام. رسوم التوصيل للضفة الغربية 20 ₪ وللداخل الفلسطيني 30 ₪ لكل طلب. التوصيل غير متاح حاليًا إلى غزة. القدس تحتاج إلى تأكيد تكلفة التوصيل قبل إتمام الطلب. لا يُعد إنشاء الطلب تحصيلًا لقيمته. تخضع هذه المسودة لمراجعة صاحب المتجر قبل النشر النهائي."},
    analytics:{enabled:false,ga4Id:null,metaPixelId:null,searchConsoleVerification:null},
    launchApproval:{approved:false,reason:"بانتظار صور المنتجات الأصلية ومراجعة البيانات والسياسات وتجهيز الإنتاج."},
  };
  for (const [key,value] of Object.entries(settings)) await db.siteSetting.upsert({where:{key},create:{key,value},update:{}});
  const sections = [
    {key:"hero",title:"من أصالة التراث إلى روتين العناية بشعرك",body:"اكتشفي منتجات ركن الحناء المستوحاة من مكونات العناية التقليدية بالشعر، بتجربة تسوق سهلة ومريحة."},
    {key:"heritage",title:"من تراثنا، لروتينك اليومي",body:"للحناء والسدر والمشاط حضور في العناية التراثية بالشعر. نؤمن بالاختيار الواعي وفهم معلومات كل منتج قبل استخدامه، دون مبالغة في الوعود."},
    {key:"choose",title:"كيف تختارين المنتج؟",body:"ابدئي بفئة المنتج وشكله ووزنه، ثم راجعي المكونات وطريقة الاستخدام المعتمدة على صفحة المنتج. الماسك والبودرة منتجان مختلفان؛ لا تفترضي تطابق تركيبتهما أو طريقة استعمالهما."},
    {key:"why",title:"لماذا ركن الحناء؟",body:"علامة فلسطينية تهتم بمنتجات العناية بالشعر المستوحاة من التراث، مع أسعار واضحة وتجربة عربية سهلة ومريحة. لا نقدّم خدمات نقش الحناء على اليدين."},
  ];
  for (const [position,section] of sections.entries()) await db.contentSection.upsert({where:{key:section.key},create:{...section,position},update:{}});
  const faqs = [
    ["هل تقدّمون نقش الحناء على اليدين؟","لا، ركن الحناء علامة لمنتجات العناية بالشعر، ولا يقدّم خدمات نقش الحناء على اليدين."],
    ["إلى أين يتوفر التوصيل؟","إلى الضفة الغربية والداخل الفلسطيني. التوصيل غير متاح حاليًا إلى غزة، والقدس تحتاج تأكيد المنطقة والتكلفة قبل إتمام الطلب."],
    ["ما رسوم التوصيل؟","20 ₪ للطلب في الضفة الغربية، و30 ₪ للطلب في الداخل الفلسطيني، وتُضاف الرسوم مرة واحدة للطلب. تكلفة القدس لم تُعتمد بعد."],
    ["كيف أدفع قيمة الطلب؟","الدفع عند الاستلام فقط. إنشاء الطلب لا يعني أنه مدفوع، ويظهر المبلغ المستحق بوضوح في ملخص الطلب."],
    ["هل المنتجات الطبيعية مناسبة للجميع؟","لا يمكن افتراض ذلك؛ اقرئي المكونات وطريقة الاستخدام والتحذيرات المعتمدة لكل منتج، وتجنّبي استخدامه عند وجود حساسية معروفة لأي من مكوّناته."],
  ];
  for (const [position,[question,answer]] of faqs.entries())
    await db.fAQ.upsert({where:{id:`faq-${position+1}`},create:{id:`faq-${position+1}`,question,answer,position,published:true},update:{}});
  const articles = [
    ["henna-hair-care","الحناء في العناية بالشعر","للحناء حضور في تقاليد العناية بالشعر. الاستخدام التراثي وحده لا يثبت أي نتيجة علاجية. قبل اختيار المنتج، راجعي تركيبته الفعلية وتعليماته وتحذيراته؛ فلا يصح تعميم معلومات مادة مفردة على خلطة مجهولة المكونات."],
    ["sidr-traditional-use","السدر واستخداماته التقليدية للشعر","يُذكر السدر في ممارسات العناية التراثية. من المهم التمييز بين الوصف التراثي والدليل العلمي، وبين بودرة السدر وماسك السدر. لا نفترض تطابق المنتجين أو مكوّناتهما أو تعليماتهما، ونرجع إلى البيانات المعتمدة لكل عبوة."],
    ["what-is-mashat","ما هو المشاط؟","المشاط اسم متداول لمنتجات ترتبط بالعناية التقليدية بالشعر، وقد تختلف التركيبات بين المنتجات والمناطق. اللون أو الاسم وحدهما لا يحددان المكونات؛ راجعي قائمة مكونات المنتج المعتمدة قبل الاستخدام، ولا تفترضي أن المشاط الأحمر والأخضر منتج واحد."],
    ["choose-hair-routine","كيف تختارين روتين العناية بالشعر؟","ابدئي بتحديد ما تحتاجه تجربتك اليومية، واقرئي تعليمات كل منتج قبل دمجه في الروتين. تجنّبي إدخال عدة منتجات جديدة في الوقت نفسه إذا كنت تريدين معرفة مدى ملاءمة كل منها. عند وجود مشكلة مستمرة في الشعر أو فروة الرأس، استشيري مختصًا بدل الاعتماد على ادعاءات تجميلية علاجية."],
    ["dry-hair-care","نصائح التعامل مع الشعر الجاف","تختلف حالة الشعر من شخص لآخر. راقبي أثر الحرارة والتصفيف والغسل على شعرك، واستخدمي المنتجات وفق تعليماتها. لا يعني وصف منتج بأنه طبيعي أنه آمن للجميع أو أنه يعالج سبب الجفاف. عند تهيج فروة الرأس أو أعراض مستمرة، أوقفي المنتج المشتبه به واطلبي مشورة مختص."],
    ["hair-type-condition","الفرق بين أنواع الشعر وحالته","قد يصف نوع الشعر شكل الشعرة، بينما تتغير حالته بحسب العناية والتعرض للحرارة وعوامل أخرى. لا يكفي تصنيف واحد لاختيار منتج يناسب الجميع. راجعي المكونات والتعليمات وتجربتك الشخصية دون تعميم نتائج الآخرين أو اعتبارها دليلًا علاجيًا."],
    ["new-product-sensitivity","اختبار الحساسية قبل استخدام منتج جديد","اتبعي تعليمات اختبار الحساسية الخاصة بالمنتج إن توفرت. لا تختبري منتجًا يحتوي مادة تعرفين أن لديك حساسية تجاهها، ولا تستخدميه على جلد متهيج. الاختبار المنزلي لا يضمن عدم حدوث تفاعل لاحق ولا يغني عن تقييم مختص عند وجود تاريخ حساسية. أوقفي الاستخدام واطلبي المساعدة المناسبة إذا حدث تفاعل."],
  ];
  for (const [slug,title,body] of articles) await db.article.upsert({where:{slug},create:{slug,title,excerpt:body.slice(0,140),body,published:false,reviewed:false},update:{}});
  console.info("Seed complete: 9 draft products; reviewed delivery fees; checkout disabled; 7 draft articles. Existing administrative changes preserved.");
}

main().finally(()=>db.$disconnect());
