package com.godardstack;

import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchHistoryController {

    private static final Pattern ITEM_ID = Pattern.compile("[a-z0-9-]{1,64}");

    private final SearchHistoryRepository repository;

    public SearchHistoryController(SearchHistoryRepository repository) {
        this.repository = repository;
    }

    @GetMapping(value = "/history", produces = MediaType.APPLICATION_JSON_VALUE)
    public String history() {
        return "{\"favorites\":" + toJson(repository.findFavorites())
                + ",\"recents\":" + toJson(repository.findRecents()) + "}";
    }

    @PutMapping("/favorites/{id}")
    public ResponseEntity<Void> addFavorite(@PathVariable String id) {
        return apply(id, repository::addFavorite);
    }

    @DeleteMapping("/favorites/{id}")
    public ResponseEntity<Void> removeFavorite(@PathVariable String id) {
        return apply(id, repository::removeFavorite);
    }

    @PutMapping("/recents/{id}")
    public ResponseEntity<Void> addRecent(@PathVariable String id) {
        return apply(id, repository::addRecent);
    }

    @DeleteMapping("/recents/{id}")
    public ResponseEntity<Void> removeRecent(@PathVariable String id) {
        return apply(id, repository::removeRecent);
    }

    private ResponseEntity<Void> apply(String id, Consumer<String> action) {
        if (!ITEM_ID.matcher(id).matches()) {
            return ResponseEntity.badRequest().build();
        }
        action.accept(id);
        return ResponseEntity.noContent().build();
    }

    private String toJson(List<String> ids) {
        return ids.stream().map(id -> "\"" + id + "\"").collect(Collectors.joining(",", "[", "]"));
    }
}
