// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "SeasonSprint",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "SeasonSprint",
            targets: ["SeasonSprint"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/clerk/clerk-ios", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "SeasonSprint",
            dependencies: [
                .product(name: "ClerkKit", package: "clerk-ios"),
            ],
            resources: [
                .copy("Resources/Logo.png"),
            ]
        ),
    ]
)
