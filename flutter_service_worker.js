'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {"flutter_bootstrap.js": "90c602cbcde3f279cc8c0d68ee5bef07",
"version.json": "e5476b502e18143e26ec348aba945171",
"icon.png": "a8db9cdef78ddff6d6fa0e40a2ed7e86",
"index.html": "399d481bbdb838e2b63bfdff739d87f4",
"/": "399d481bbdb838e2b63bfdff739d87f4",
"main.dart.js": "be79fc29f6cf55e247136ba056c83812",
"flutter.js": "76f08d47ff9f5715220992f993002504",
"favicon.png": "a8db9cdef78ddff6d6fa0e40a2ed7e86",
"icons/Icon-192.png": "ac9a721a12bbc803b44f645561ecb1e1",
"icons/Icon-512.png": "96e752610906ba2a93c65f8abe1645f1",
"assets/AssetManifest.json": "deca4b0c64708fbbdf925eb57f15aea3",
"assets/NOTICES": "977ae62f2410fbc758ccfbdd7d163caf",
"assets/FontManifest.json": "bd5509cdd2775446eca63f5c6b0b1df4",
"assets/AssetManifest.bin.json": "60375fb58ee6ffd7be3dd95a25a48fc2",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "33b7d9392238c04c131b6ce224e13711",
"assets/packages/font_awesome_flutter/lib/fonts/fa-solid-900.ttf": "c3eabf22c7454a52c15a4485f818f3de",
"assets/packages/font_awesome_flutter/lib/fonts/fa-regular-400.ttf": "f3307f62ddff94d2cd8b103daf8d1b0f",
"assets/packages/font_awesome_flutter/lib/fonts/fa-brands-400.ttf": "bf2cff6a887439e713425d98e2433c9f",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"assets/AssetManifest.bin": "2a74849d19bfdddf3fc0f00c3c7553d9",
"assets/fonts/MaterialIcons-Regular.otf": "a1b02a5544fe375fb4329d584295c14c",
"assets/assets/audios/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/jsons/Animation_-_1741104058416.json": "964237e084ae9c5d0341f3d082b5b223",
"assets/assets/jsons/Animation_-_1741103726849.json": "c7a125033aee14e92a4d0d9b1778f32d",
"assets/assets/jsons/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/jsons/Animation_-_1741103574539.json": "5772f3ff649829aa200bfb5e27d93437",
"assets/assets/rive_animations/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/images/icon_transparent.png": "a47af7643bf9e265aa9bdf015244a850",
"assets/assets/images/6d9f9de27017591567f6c2d94f21e797.png": "2bbe633594d186bfb8823ee12a65f5c0",
"assets/assets/images/db2310455dd76b2cd290f67635f6fa78.png": "f1dcf1cbb2a3be27988054feca083a2d",
"assets/assets/images/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/images/unnamed.png": "a2abf4b4a67cdfac2dc53a91ae0f581b",
"assets/assets/images/noteless-case-study.png": "65a07ad21ee8a87c716d009bc9ed9b2e",
"assets/assets/images/IMG_0899.jpg": "17582484029af5edc081cbde72d12a60",
"assets/assets/images/hero_image.png": "c373489b6f829b584ac13f0bd2cd4db5",
"assets/assets/images/pngwing.com.png": "45ec5c8523c42019e2aa9fe5436750af",
"assets/assets/images/studentventure-case-study.png": "ef8d615d0737fef17300d681ac7f637c",
"assets/assets/images/logo_text_2.png": "3dec39c0440d51e81281b6f94a4147f9",
"assets/assets/images/youcook-case-study.png": "ad0f88dd7abff18108952aa9a79a96c8",
"assets/assets/images/images.png": "c82cbe3d629887b8b24e9a854b430e37",
"assets/assets/images/dart-icon-1021x1024-0q8oyg7c.png": "586ecc41d871afc1f3833c33c53294e4",
"assets/assets/videos/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/pdfs/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/fonts/TT_Norms_Pro_Light.otf": "444553bd390fa0bc077b9e88fa41db7d",
"assets/assets/fonts/TT_Norms_Pro_ExtraBold.otf": "e2993b2798422f9c429adf22905566b7",
"assets/assets/fonts/TT_Norms_Pro_Medium.otf": "74bcbbc5aba205b0735e32971f74fc1c",
"assets/assets/fonts/TT_Norms_Pro_Light_Italic.otf": "9c38634bb9ac4c16a95faa75bad32dc6",
"assets/assets/fonts/TT_Norms_Pro_Thin.otf": "597a1d5b655f4618b65898fb565c1690",
"assets/assets/fonts/TT_Norms_Pro_Bold.otf": "f9aa4e80899faa249618f4f59575be5c",
"assets/assets/fonts/TT_Norms_Pro_ExtraLight.otf": "12d501af424f91a411796cccee195661",
"assets/assets/fonts/TT_Norms_Pro_Regular.otf": "e3dc320177d5f5c2272158943d270e79",
"assets/assets/fonts/favicon.png": "5dcef449791fa27946b3d35ad8803796",
"assets/assets/fonts/TT_Norms_Pro_Thin_Italic.otf": "8e22146677b75ec635f88cce4fbe72cf",
"assets/assets/fonts/TT_Norms_Pro_ExtraLight_Italic.otf": "288060597f284aa3eb8013ffb42887ec",
"assets/assets/fonts/TT_Norms_Pro_Bold_Italic.otf": "ffc06f1e0613a6d6c4524bbea36d2353",
"assets/assets/fonts/TT_Norms_Pro_Italic.otf": "672037c30c0f0d5bbc633b3fea0593fd",
"assets/assets/fonts/TT_Norms_Pro_ExtraBold_Italic.otf": "35a17a48013871f460dbfaa8a92a0388",
"assets/assets/fonts/TT_Norms_Pro_Medium_Italic.otf": "d7b23fbe402935844294903bc9852e4b",
"logo_text_2.png": "3dec39c0440d51e81281b6f94a4147f9",
"canvaskit/skwasm_st.js": "d1326ceef381ad382ab492ba5d96f04d",
"canvaskit/skwasm.js": "f2ad9363618c5f62e813740099a80e63",
"canvaskit/skwasm.js.symbols": "80806576fa1056b43dd6d0b445b4b6f7",
"canvaskit/canvaskit.js.symbols": "68eb703b9a609baef8ee0e413b442f33",
"canvaskit/skwasm.wasm": "f0dfd99007f989368db17c9abeed5a49",
"canvaskit/chromium/canvaskit.js.symbols": "5a23598a2a8efd18ec3b60de5d28af8f",
"canvaskit/chromium/canvaskit.js": "ba4a8ae1a65ff3ad81c6818fd47e348b",
"canvaskit/chromium/canvaskit.wasm": "64a386c87532ae52ae041d18a32a3635",
"canvaskit/skwasm_st.js.symbols": "c7e7aac7cd8b612defd62b43e3050bdd",
"canvaskit/canvaskit.js": "6cfe36b4647fbfa15683e09e7dd366bc",
"canvaskit/canvaskit.wasm": "efeeba7dcc952dae57870d4df3111fad",
"canvaskit/skwasm_st.wasm": "56c3973560dfcbf28ce47cebe40f3206",
"canvaskit/skwasm.worker.js": "89990e8c92bcb123999aa81f7e203b1c"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"flutter_bootstrap.js",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
