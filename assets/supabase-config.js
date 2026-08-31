/*
  RelationSync.ai — конфигурация Supabase для личного кабинета.

  Эти значения уже настоящие (проект пользователя в Supabase) — это НЕ
  секретный ключ. Publishable key специально сделан Supabase публичным для
  использования в браузере; реальная защита данных настраивается через Row
  Level Security (RLS) в самом Supabase, а не через секретность этого ключа.
  Его можно спокойно публиковать в открытом репозитории на GitHub Pages.

  Если понадобится другой проект Supabase — замените url и anonKey на
  значения со страницы Project Settings → API (Publishable key, НЕ Secret key).
*/

window.SUPABASE_CONFIG = {
  url: "https://tbbtblbytytzyvsmaqzg.supabase.co",
  anonKey: "sb_publishable_fqxhATKVNmqUXVcQ3-euTw_Uon5muQp",
};
