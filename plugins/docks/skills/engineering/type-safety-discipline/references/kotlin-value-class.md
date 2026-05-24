# Kotlin — Value Classes + Sealed Types

Deep examples for the patterns referenced in the main `SKILL.md`. Read this when working in a Kotlin codebase.

## Value classes for ID safety (Kotlin 1.5+)

```kotlin
@JvmInline
value class UserId(val value: String)

@JvmInline
value class OrgId(val value: String)

fun loadUser(id: UserId) { /* ... */ }

val orgId = OrgId("...")
loadUser(orgId)  // ✗ compile error
```

`@JvmInline` makes the wrapper free at the JVM bytecode level — the underlying `String` is passed without boxing — while the Kotlin type system treats `UserId` and `OrgId` as distinct.

### Validated value class

When the wrapped value must satisfy a constraint:

```kotlin
@JvmInline
value class Email private constructor(val value: String) {
    companion object {
        fun parse(raw: String): Result<Email> =
            if (raw.contains('@')) Result.success(Email(raw))
            else Result.failure(IllegalArgumentException("Missing @"))
    }
}
```

The `private constructor` forces callers through the validated factory.

## Sealed interfaces for tagged unions

```kotlin
sealed interface Invite {
    data class User(val id: UserId) : Invite
    data class Guest(val email: String, val name: String) : Invite
}

fun send(invite: Invite) = when (invite) {
    is Invite.User -> sendToUser(invite.id)
    is Invite.Guest -> sendToGuest(invite.email, invite.name)
}
```

`sealed` constrains subclasses to the same compilation unit (Kotlin 1.5+). Combined with `when` as an expression, the compiler checks exhaustiveness.

### Exhaustive `when`

```kotlin
// EXHAUSTIVE — `when` is used as an expression (assigned)
val message = when (invite) {
    is Invite.User -> "Sent to user ${invite.id.value}"
    is Invite.Guest -> "Sent to ${invite.email}"
}

// NOT exhaustive — statement form, no compile-time check
when (invite) {
    is Invite.User -> sendToUser(invite.id)
    is Invite.Guest -> sendToGuest(invite.email, invite.name)
}
```

Always assign or return from `when` to get the check.

## Parse-don't-validate with kotlinx.serialization

```kotlin
@Serializable
data class Config(
    val apiKey: String,
    val port: Int,
)

val config: Config = Json.decodeFromString(raw)
```

Or with Jackson for JVM-only projects:

```kotlin
val config: Config = ObjectMapper()
    .registerModule(KotlinModule.Builder().build())
    .readValue(raw)
```

Both throw on shape mismatch — no `as` casts.

## Smart-cast over unchecked cast

```kotlin
// BAD — unchecked, throws at runtime if wrong
val s = value as String

// GOOD — smart-cast via `is`
if (value is String) {
    println(value.length)  // value is smart-cast to String here
}

// SAFE — `as?` returns null on failure
val s = value as? String  // String?
```

## Avoid

- **`as` unchecked casts** — throw `ClassCastException` at runtime. Use `is` smart-casts or `as?`.
- **`Any?`** for anything other than truly heterogeneous collections. Use sealed types.
- **`lateinit var`** as an escape hatch — throws on access if unset. Prefer constructor injection.
- **String typing for IDs** — wrap with value classes.

## References

- Kotlin docs — inline value classes: https://kotlinlang.org/docs/inline-classes.html
- Kotlin docs — sealed classes and interfaces: https://kotlinlang.org/docs/sealed-classes.html
- kotlinx.serialization: https://github.com/Kotlin/kotlinx.serialization
