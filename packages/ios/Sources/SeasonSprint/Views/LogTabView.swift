import SwiftUI

/// Log tab: add/overwrite a point for a date, and an editable list of all records.
struct LogTabView: View {
    let store: DashboardStore
    @Binding var showSettings: Bool

    @State private var newDate = Date()
    @State private var newValueText = ""
    /// Fans seasons: the "Y" of the in-game "X / Y" (newValueText holds X).
    @State private var newRequiredText = ""
    @State private var editing: Point?

    private var parsedNewValue: Int? {
        guard let x = Int(newValueText.trimmingCharacters(in: .whitespaces)) else { return nil }
        guard store.usesFansEntry else { return x }
        guard let y = Int(newRequiredText.trimmingCharacters(in: .whitespaces)) else { return nil }
        return fansTotal(inRank: x, required: y)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $newDate, displayedComponents: .date)
                    if store.usesFansEntry {
                        HStack {
                            TextField("Fans", text: $newValueText)
                                .keyboardType(.numberPad)
                            Text("/").foregroundStyle(.secondary)
                            TextField("Needed", text: $newRequiredText)
                                .keyboardType(.numberPad)
                        }
                        if let total = parsedNewValue {
                            Text("= \(total.formatted()) fans this season")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        TextField("Win points", text: $newValueText)
                            .keyboardType(.numberPad)
                    }
                    Button {
                        guard let value = parsedNewValue else { return }
                        Task {
                            await store.addOrSet(date: DateKey.dayString(from: newDate), winPoints: value)
                            newValueText = ""
                            newRequiredText = ""
                        }
                    } label: {
                        Text("Save point")
                            .opacity(store.isWriting ? 0 : 1)
                            .overlay { if store.isWriting { ProgressView() } }
                    }
                    .disabled(parsedNewValue == nil || store.isWriting)
                } header: {
                    Text("Add point")
                } footer: {
                    Text(store.usesFansEntry
                         ? "Enter the fans shown on the World Tour panel, e.g. 1,250 / 6,000 — it's saved as your season total. Saving a date that already exists overwrites it."
                         : "Points are your cumulative season total. Saving a date that already exists overwrites it.")
                }

                Section("Records") {
                    if store.points.isEmpty {
                        Text("No records yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(recordsNewestFirst) { point in
                            Button {
                                editing = point
                            } label: {
                                HStack {
                                    Text(point.date, format: .dateTime.year().month().day())
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    Text(point.winPoints.formatted())
                                        .monospacedDigit()
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    Task { await store.deletePoint(point) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Log")
            .toolbar { settingsButton(showSettings: $showSettings) }
            .sheet(item: $editing) { point in
                EditPointSheet(store: store, point: point)
            }
        }
    }

    private var recordsNewestFirst: [Point] {
        store.points.sorted { $0.date > $1.date }
    }
}
