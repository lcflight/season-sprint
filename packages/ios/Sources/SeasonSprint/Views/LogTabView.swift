import SwiftUI

/// Log tab: add/overwrite a point for a date, and an editable list of all records.
struct LogTabView: View {
    let store: DashboardStore
    @Binding var showSettings: Bool

    @State private var newDate = Date()
    @State private var newValueText = ""
    @State private var editing: Point?

    private var parsedNewValue: Int? {
        Int(newValueText.trimmingCharacters(in: .whitespaces))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $newDate, displayedComponents: .date)
                    TextField("Win points", text: $newValueText)
                        .keyboardType(.numberPad)
                    Button {
                        guard let value = parsedNewValue else { return }
                        Task {
                            await store.addOrSet(date: DateKey.dayString(from: newDate), winPoints: value)
                            newValueText = ""
                        }
                    } label: {
                        if store.isWriting {
                            ProgressView()
                        } else {
                            Text("Save point")
                        }
                    }
                    .disabled(parsedNewValue == nil || store.isWriting)
                } header: {
                    Text("Add point")
                } footer: {
                    Text("Points are your cumulative season total. Saving a date that already exists overwrites it.")
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
                                    Text("\(point.winPoints)")
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
