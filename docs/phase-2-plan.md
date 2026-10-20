# Фаза 2 — Календар і відпустки: план і рішення

21.10.2026 · PRD розділи 5, 8 · статус: **виконується без окремого погодження** (Влад, 21.10.2026: «після фази — коміт і одразу наступна фаза»). Рішення нижче — мої рекомендації; будь-яке можна змінити.

## 1. Обсяг і критерії готовності

Календарні шари (ручні, ICS/CSV-імпорт з попереднім переглядом, системні «Дні народження» й «Річниці роботи»), WorkWeek,
ICS-підписка, довідник типів відсутностей, політики нарахування, журнал балансу, щоденний job, kind `absence`,
стартовий шаблон 5 «Відпустка».

**Готово, коли (автотести):** політика «10 днів, згорають у річницю найму» (вкл. найм 29 лютого й ідемпотентність job);
неробочі дні не списуються з балансу (вихідні й неробоче свято), інформаційний шар не впливає; людина в Києві й людина
в Огайо бачать різні свята.

## 2. Схема

```text
CalendarLayer       id, name_uk, name_en?, color, effect (non_working/informational), source (manual/ics_import/csv_import/system),
                    system_kind? (birthdays/work_anniversaries), visibility (all/assigned_only)
CalendarEvent       id, layer_id, title_uk, title_en?, date, end_date?, recurrence (none/yearly),
                    non_working? [нове — PRD 5: «прапорцем шару або окремої події»; null = як у шару]
LayerAssignment     layer_id, target_type (company/department/location/employee), target_id
WorkWeek            id, location_id? | company_id?, days int[] (ISO 1=Пн … 7=Нд)
AbsenceType         id, code, name_uk, name_en?, color, paid, deducts_balance, requires_document, requires_approval,
                    min_days?, max_days?, allow_half_day
AbsencePolicy       id, name, days_per_period, accrual (upfront/monthly), period_start (hire_date/jan_1),
                    expiry (end_of_period/months_after/never), expiry_months?, carryover_max, available_after_days,
                    allow_negative, count_days (working/calendar)
AbsenceBalance      id, employee_id, policy_id, period_start, period_end, closed_at? — один рядок на період нарахування
AbsenceLedgerEntry  id, balance_id, type (accrual/usage/expiry/carryover [нове]/manual_adjustment), amount, date, comment?,
                    absence_id?, idempotency_key (unique) [тех]
Absence             id, employee_id, type_id, start_date, end_date, half_day, days, status (approved/cancelled),
                    request_id?, document_id?
+ Company.absence_policy_id?, Department.absence_policy_id? [нове — PRD: політики «призначаються на компанію, відділ або людину»]
+ Employee.absence_policy_id → FK
+ User.calendar_token? [тех — секрет для ICS-підписки]
```

Нові права: `balances.adjust` (all) — ручне коригування (за PRD «тільки суперадмін»; CEO має всі права).
Шари, типи, політики — існуюче `settings.manage`.

## 3. Ключові рішення

1. **Календар людини** = шари, призначені її компанії, відділу (разом із батьківськими), локації або їй особисто.
   Шари з `visibility = all` бачать усі, але вплив `non_working` діє лише на призначених.
2. **Робочий день** = день тижня з WorkWeek (локація → компанія → Пн–Пт) і не неробоча подія з її шарів.
   Цим самим календарем рахуються дні відпустки й SLA кроків (фаза 1 підключається без зміни інтерфейсу).
3. **Український шар у seed — інформаційний.** Під час воєнного стану свята робочі; рішення фіксує Legal і вмикає
   суперадмін прапорцем. US Federal — неробочий, призначений локації Columbus, OH.
4. **Один пул балансу на людину** — ефективна політика: людина → відділ (вгору по дереву) → компанія. Типи з
   `deducts_balance` списують з нього.
5. **Періоди**: від дати найму (річниця; 29 лютого → 28 лютого в невисокосні роки) або від 1 січня.
   `upfront` — повний обсяг на старті періоду (для `jan_1` перший неповний рік — пропорційно, крок 0.5 дня);
   `monthly` — обсяг/12 на початку кожного місяця періоду.
6. **Кінець періоду**: залишок понад `carryover_max` згорає (`end_of_period` — у день закінчення, `months_after` — через
   N місяців, `never` — не згорає й переноситься повністю); перенесене стає записом `carryover` у новому періоді.
   Використання списується FIFO — спочатку зі старшого незгорілого періоду.
7. **Доступно після N днів** — відсутність, що списує баланс, не може починатися раніше дати найму + N.
8. **Мінус** — якщо політика забороняє, заявку не створити, а при погодженні баланс перевіряється ще раз.
9. **Пів дня** — лише для одноденної відсутності типу з `allow_half_day`.
10. **kind absence**: поля `absence_type` (select `{source: "absence_types"}`), `dates` (date_range), `half_day`, `document`.
    Суб'єкт — ініціатор (або поле `employee`). Для типу без погодження кроки `approve` пропускаються (`skipped`).
    При завершенні створюється Absence й запис `usage`; документ (лікарняний) потрапляє в Document співробітника.
11. **Щоденний job** — pg-boss, окремий процес `npm run worker`, щодня 00:30 Europe/Kyiv; той самий синк викликається
    перед кожним списанням, тож баланс актуальний і без worker. Ідемпотентність — унікальний `idempotency_key`.
12. **ICS-підписка** — `/api/calendar/<token>.ics`: шари людини, дні народження колег, її власні відсутності.
    Токен генерується в профілі й може бути перевипущений.

## 4. Порядок робіт

Міграція → сервіс календаря (шари, події, призначення, WorkWeek, календар людини, імпорт ICS/CSV, ICS-фід) →
політики й журнал балансу + job → kind absence і календарний SLA → UI (календар, налаштування, баланс у профілі,
дашборд «хто відсутній») → seed і тести → коміт.
