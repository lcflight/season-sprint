import SwiftUI

/// Edit an existing record's date and value (`PUT /me/records/:id`).
struct EditPointSheet: View {
    let store: DashboardStore
    let point: Point
    @Environment(\.dismiss) private var dismiss

    @State private var date: Date
    @State private var valueText: String

    init(store: DashboardStore, point: Point) {
        self.store = store
        self.point = point
        _date = State(initialValue: DateKey.localDate(from: point.day) ?? Date())
        _valueText = State(initialValue: "\(point.winPoints)")
    }

    private var parsedValue: Int? {
        Int(valueText.trimmingCharacters(in: .whitespaces))
    }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                TextField("Win points", text: $valueText)
                    .keyboardType(.numberPad)
            }
            .navigationTitle("Edit point")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        guard let value = parsedValue else { return }
                        Task {
                            await store.updatePoint(point, date: DateKey.dayString(from: date), winPoints: value)
                            dismiss()
                        }
                    }
                    .disabled(parsedValue == nil)
                }
            }
        }
    }
}
