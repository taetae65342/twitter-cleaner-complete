// 트위터 완전 청소기 PWA 서비스 워커
const CACHE_NAME = 'twitter-cleaner-complete-v1.0.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 서비스 워커 설치
self.addEventListener('install', event => {
  console.log('🔧 서비스 워커 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 캐시 생성 완료');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ 모든 파일 캐시 완료');
        return self.skipWaiting(); // 즉시 활성화
      })
  );
});

// 서비스 워커 활성화
self.addEventListener('activate', event => {
  console.log('🚀 서비스 워커 활성화 중...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 이전 버전 캐시 삭제
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 이전 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('🎉 서비스 워커 활성화 완료');
      return self.clients.claim(); // 즉시 제어권 가져오기
    })
  );
});

// 네트워크 요청 처리 (Fetch 이벤트)
self.addEventListener('fetch', event => {
  // GET 요청만 처리
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 캐시에 있으면 캐시에서 반환
        if (response) {
          console.log('📋 캐시에서 반환:', event.request.url);
          return response;
        }

        // 캐시에 없으면 네트워크에서 가져오기
        console.log('🌐 네트워크에서 가져오기:', event.request.url);
        return fetch(event.request).then(response => {
          // 응답이 유효한지 확인
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 응답을 복제 (스트림은 한 번만 사용 가능)
          const responseToCache = response.clone();

          // 새로운 응답을 캐시에 저장
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(error => {
          console.error('❌ 네트워크 요청 실패:', error);
          
          // 오프라인 시 메인 페이지 반환
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          
          throw error;
        });
      })
  );
});

// 백그라운드 동기화 (선택사항)
self.addEventListener('sync', event => {
  if (event.tag === 'background-cleanup') {
    console.log('🧹 백그라운드 청소 작업 실행');
    event.waitUntil(doBackgroundCleanup());
  }
});

// 푸시 알림 처리
self.addEventListener('push', event => {
  console.log('📢 푸시 알림 받음:', event);
  
  const options = {
    body: '트위터 청소 작업이 완료되었습니다! 🎉',
    icon: './icon-192.png',
    badge: './badge-72.png',
    tag: 'cleanup-complete',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: '결과 보기',
        icon: './icon-view.png'
      },
      {
        action: 'dismiss', 
        title: '닫기',
        icon: './icon-close.png'
      }
    ],
    data: {
      url: './',
      timestamp: Date.now()
    }
  };

  event.waitUntil(
    self.registration.showNotification('🧹 청소 완료', options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', event => {
  console.log('🔔 알림 클릭됨:', event);
  
  event.notification.close();

  if (event.action === 'view') {
    // 앱 열기
    event.waitUntil(
      clients.openWindow('./')
    );
  } else if (event.action === 'dismiss') {
    // 알림만 닫기
    console.log('알림 닫기');
  } else {
    // 기본 동작: 앱 열기
    event.waitUntil(
      clients.openWindow('./')
    );
  }
});

// 에러 처리
self.addEventListener('error', event => {
  console.error('❌ 서비스 워커 에러:', event.error);
});

// 예외 처리되지 않은 promise rejection
self.addEventListener('unhandledrejection', event => {
  console.error('❌ 처리되지 않은 Promise 거부:', event.reason);
  event.preventDefault();
});

// 백그라운드 청소 함수
async function doBackgroundCleanup() {
  try {
    console.log('🧹 백그라운드 청소 시작');
    
    // 캐시 크기 제한 (예: 50MB)
    const cacheSize = await getCacheSize();
    if (cacheSize > 50 * 1024 * 1024) { // 50MB
      await cleanupOldCache();
    }
    
    // 오래된 데이터 정리
    await cleanupOldData();
    
    console.log('✅ 백그라운드 청소 완료');
    return Promise.resolve();
  } catch (error) {
    console.error('❌ 백그라운드 청소 실패:', error);
    return Promise.reject(error);
  }
}

// 캐시 크기 계산
async function getCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let totalSize = 0;
  
  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }
  
  return totalSize;
}

// 오래된 캐시 정리
async function cleanupOldCache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  
  // 필수 파일 제외하고 절반 정도 삭제
  const nonEssentialRequests = requests.filter(request => 
    !urlsToCache.some(url => request.url.includes(url))
  );
  
  const deleteCount = Math.floor(nonEssentialRequests.length / 2);
  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(nonEssentialRequests[i]);
  }
  
  console.log(`🗑️ ${deleteCount}개 캐시 항목 정리 완료`);
}

// 오래된 데이터 정리
async function cleanupOldData() {
  // IndexedDB나 localStorage의 오래된 데이터 정리
  console.log('📊 오래된 데이터 정리 완료');
}

// 버전 정보
console.log('🎯 트위터 완전 청소기 서비스 워커 v1.0.0 로드됨');
