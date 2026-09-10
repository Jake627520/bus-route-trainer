# Bus Route Trainer

Queensland Bus Driver Route Learning & Memory Trainer.

An independent, specialised training application engineered to help Queensland bus drivers quickly learn and retain unfamiliar bus routes, service variations, timetables, key timing points, stop sequences, and depot driver knowledge.

> **Language & Locale Standard**: This project strictly adheres to **Australian English (`en-AU`)** across all user interfaces, terminology (e.g., *timetables*, *depot*, *harbour*, *centre*, *specialised*), and user-facing documentation.

## Features (Planned)
- **Route & Variant Discovery**: Explore routes, trips, directions, and variants.
- **Stop Sequences & Timetables**: Visualise stop order, arrival/departure schedules, and timing points.
- **Driver Knowledge Layer**: Attach personal notes, hazards, caution areas, and depot pointers.
- **Active Recall Quizzes**: Next-stop, previous-stop, route sequence, and timing point quizzes.
- **Spaced Repetition System (SRS)**: Adaptive revision intervals based on recall performance.
- **Offline PWA Support**: Reliable offline access during shifts.

## Data Attribution & Licensing
Public transport data is sourced from **Translink Queensland Open Data** under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) licence.

Please refer to [`DATA-LICENSE.md`](./DATA-LICENSE.md) for full licensing details and attribution.

*Disclaimer: This application is an independent community project and is not affiliated with, endorsed by, or operated by Translink or the Queensland Government.*

## Development Methodology
This project follows a strict **OpenSpec + Test-Driven Development (TDD)** workflow:
1. **Spec-Driven**: Changes and domain rules are formally specified with OpenSpec before coding.
2. **TDD**: Tests are written and confirmed red before minimum implementation brings them to green.
3. **Data Boundary Separation**: Official GTFS transport data, application data, and driver personal knowledge are decoupled into distinct bounded contexts.
