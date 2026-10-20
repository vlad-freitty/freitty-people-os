# Фаза 3 — Зміни, ставки, оплати, премії: план і рішення

21.10.2026 · PRD розділи 6, 7 (експорт), 8 · статус: **виконується без окремого погодження** (див. фаза 2). Рішення — мої рекомендації.

## 1. Обсяг і критерії готовності

Shift (ручні й CSV-імпорт, підтвердження керівником, блокування з періодом), PaymentPeriod / Payment / PaymentLine,
розрахунок зі ставок RateHistory, статуси оплат, блокування approved для contractors без акта/інвойсу, kind `bonus` і
стартовий шаблон 6 «Старт премії», моніторинг оплат, експорт CSV/XLSX для фінансів.

**Готово, коли (автотести):** розрахунок модельного місяця CS-команди збігається з ручним розрахунком (погодинна,
позмінна й місячна ставки, зміна ставки посеред місяця, зміна через північ, зміна в Огайо, внесена з Києва, неробочий
день з коефіцієнтом, премія, коригування); contractor без акта не переходить у approved. Реальний місяць CS-команди
звіряє фінанс-команда на staging — це ручна перевірка поза автотестами.

## 2. Схема

```text
Shift          id, employee_id, company_id, department_id, location_id?, start_at, end_at (UTC), timezone (IANA),
               work_date [тех — дата початку в таймзоні зміни: «через північ рахується за датою початку»],
               shift_type (text, напр. regular / night), status (planned/confirmed/locked), source (manual/csv_import),
               confirmed_by?, confirmed_at? [тех]
PaymentPeriod  id, company_id, period_start, period_end, status (open/calculated/locked), locked_at? [тех]
Payment        id, period_id, employee_id, currency, total, status (calculated/documents_received/approved/paid),
               paid_at?, payment_ref?, approved_by?, approved_at? [тех]
PaymentLine    id, payment_id, kind (shifts/monthly_rate/bonus/adjustment), amount, description, source_ids[]
Bonus          id, employee_id, amount, currency, period, reason, source (cs_incentive/manual), status
               (approved/included/paid), request_id, payment_id? [тех — у яку виплату включено]
+ Company.non_working_shift_coefficient (default 1.0) [нове — PRD 6: «коефіцієнт … налаштовується»]
```

Нові права: `shifts.manage` (all / departments) — вносити, редагувати й підтверджувати зміни; `payments.manage` (all) —
періоди, розрахунок, статуси, коригування, експорт. Перегляд оплат і премій — наявне `employees.view_sensitive`,
змін — `employees.view`. Роль `finance` отримує `payments.manage`, `employees.view` і `employees.view_sensitive` на всіх.

## 3. Ключові рішення

1. **Дата зміни** — дата її початку в таймзоні зміни (локація співробітника → UTC). Зміна 31.10 22:00–06:00 належить жовтню;
   зміна, внесена з Києва для людини в Огайо, рахується в огайській даті.
2. **Ставка** — запис RateHistory, чинний на дату зміни. `hourly` = години × ставка; `per_shift` = ставка за зміну;
   `monthly` — окремий рядок `monthly_rate`, пропорційно календарним дням дії ставки в кожному місяці періоду.
3. **Неробочий день** (за календарем співробітника: робочий тиждень + неробочі шари) множить оплату зміни на коефіцієнт компанії.
4. **У розрахунок ідуть лише підтверджені зміни** (`confirmed`/`locked`); `planned` — ні.
5. **Розподіл витрат** — зміни йдуть у період компанії, вказаної в самій зміні; місячна ставка й премії — компанії співробітника.
6. **Одна оплата на (співробітник, валюта) в періоді.** Перерахунок перебудовує рядки shifts/monthly_rate/bonus для оплат у
   статусі calculated/documents_received; рядки adjustment (з обов'язковим коментарем) зберігаються; approved/paid не чіпаються.
7. **Премія** потрапляє в найближчий відкритий період своєї компанії під час розрахунку (статус → included), при оплаті → paid.
8. **Contractor → approved** лише якщо є Document типу `act` або `invoice` цієї людини, у якого `period` = «YYYY-MM» місяця
   періоду або дати дії перетинають період. Відкрите питання PRD (для яких contractors обов'язково) — поки для всіх.
9. **Блокування періоду**: статус locked, усі зміни періоду → locked і не редагуються; перерахунок неможливий.
10. **kind bonus**: поля `employee`, `amount`, `period` (text «YYYY-MM»), `reason`, необов'язкові `currency`, `source`.
    Шаблон 6: заявка → погодження керівником → погодження CEO → фінанси; при завершенні — Bonus зі статусом approved.
11. **CSV-імпорт змін**: work_email, start, end (місцевий час «YYYY-MM-DD HH:mm»), shift_type, department?, company?;
    ключ — (людина, початок); заблокований період відхиляється.
12. **Експорт** CSV і XLSX (exceljs) по періоду й компанії: співробітник, тип зайнятості, суми рядків за видами, підсумок,
    валюта, статус, наявність документа.
